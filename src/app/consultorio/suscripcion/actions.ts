"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { issueCfdi } from "@/lib/billing/cfdi";
import { RFC_RE } from "@/lib/billing/map";
import { billingConfigured, portalConfiguration, priceFor, stripe } from "@/lib/billing/stripe";
import { syncSubscription } from "@/lib/billing/sync";
import { getSubscription } from "@/lib/plan";
import { createAdminClient, createClient, requireRole } from "@/lib/supabase/server";

export type ChooseResult = { ok?: string; error?: string; url?: string };

const REASONS: Record<string, string> = {
  owner: "Solo la persona titular del consultorio puede cambiar el plan.",
  billing: "Para cambiar de plan después de la prueba, suscríbete al plan que quieras.",
  plan: "Ese plan no existe.",
};
const PlanCode = z.enum(["p5", "p10", "p20", "pmax"]);

async function origin() {
  const h = await headers();
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const o = h.get("origin");
  return o && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o) ? o : site ?? o ?? "http://localhost:3000";
}

/** Titular con su suscripción; los pagos solo los gestiona el dueño del consultorio. */
async function ownerSub() {
  await requireRole("nutriologo");
  const sub = await getSubscription();
  if (!sub) return { error: "No encontramos tu consultorio." } as const;
  if (!sub.isOwner) return { error: REASONS.owner } as const;
  return { sub } as const;
}

const friendly = (e: unknown) => (e instanceof Error ? e.message : "No se pudo conectar con el procesador de pagos.");

/** Cancelar (al final del periodo) o reanudar. Sin penalización (LFPC, art. 76 Bis). */
export async function setCancel(cancel: boolean): Promise<ChooseResult> {
  const o = await ownerSub();
  if ("error" in o) return { error: o.error };
  const supabase = await createClient();
  if (o.sub.stripeSubscribed) {
    try {
      const { data: c } = await supabase.from("clinics").select("stripe_subscription_id").maybeSingle();
      const updated = await stripe().subscriptions.update(c!.stripe_subscription_id!, { cancel_at_period_end: cancel });
      await syncSubscription(updated);
    } catch (e) { return { error: friendly(e) }; }
  } else {
    const { data, error } = await supabase.rpc("set_cancel", { p_cancel: cancel });
    if (error) return { error: error.message };
    const r = data as { ok: boolean; reason?: string };
    if (!r.ok) return { error: r.reason === "owner" ? REASONS.owner : "La suscripción ya no está vigente." };
  }
  revalidatePath("/consultorio", "layout");
  return { ok: cancel ? "Suscripción cancelada. No se te volverá a cobrar." : "Suscripción reanudada." };
}

/** Durante la prueba y sin suscripción pagada: probar otro plan sin cobro. */
export async function choosePlan(code: string): Promise<ChooseResult> {
  await requireRole("nutriologo");
  const c = PlanCode.safeParse(code);
  if (!c.success) return { error: REASONS.plan };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("choose_plan", { p_code: c.data });
  if (error) return { error: error.message };
  const r = data as { ok: boolean; reason?: string; active?: number; max?: number };
  if (!r.ok) {
    if (r.reason === "patients") return { error: `Tienes ${r.active} pacientes activos y ese plan incluye ${r.max}. Marca algunos como inactivos primero.` };
    return { error: REASONS[r.reason ?? ""] ?? "No se pudo cambiar el plan." };
  }
  revalidatePath("/consultorio", "layout");
  return { ok: "Plan actualizado." };
}

function planCheck(sub: NonNullable<Awaited<ReturnType<typeof getSubscription>>>, code: string) {
  const plan = sub.plans.find((p) => p.code === code);
  if (!plan) return { error: REASONS.plan } as const;
  if (plan.price_mxn == null) return { error: "Ese plan todavía no tiene precio." } as const;
  if (plan.max_patients != null && sub.activePatients > plan.max_patients)
    return { error: `Tienes ${sub.activePatients} pacientes activos y ese plan incluye ${plan.max_patients}. Marca algunos como inactivos primero.` } as const;
  return { plan: { ...plan, price_mxn: plan.price_mxn } } as const;
}

/** Abre Stripe Checkout para suscribirse. Si sigue en prueba, el primer cobro llega al terminar la prueba. */
export async function startCheckout(code: string): Promise<ChooseResult> {
  if (!billingConfigured()) return { error: "Los pagos en línea todavía no están configurados." };
  const c = PlanCode.safeParse(code);
  if (!c.success) return { error: REASONS.plan };
  const o = await ownerSub();
  if ("error" in o) return { error: o.error };
  const { sub } = o;
  if (sub.stripeSubscribed) return { error: "Ya tienes una suscripción activa. Usa «Cambiar a este plan»." };
  const pc = planCheck(sub, c.data);
  if ("error" in pc) return { error: pc.error };

  try {
    const s = stripe();
    const admin = createAdminClient();
    const supabase = await createClient();
    const [{ data: clinic }, { data: { user } }] = await Promise.all([
      admin.from("clinics").select("stripe_customer_id, trial_ends_at, status, comp_until").eq("id", sub.clinicId).single(),
      supabase.auth.getUser(),
    ]);
    let customer = clinic?.stripe_customer_id as string | null;
    if (!customer) {
      const created = await s.customers.create({ email: user?.email, name: sub.clinicName, metadata: { clinic_id: sub.clinicId } },
        { idempotencyKey: `customer-${sub.clinicId}` });
      customer = created.id;
      await admin.from("clinics").update({ stripe_customer_id: customer }).eq("id", sub.clinicId).is("stripe_customer_id", null);
    }
    // Conservar los días de prueba que queden (Stripe exige al menos 48 h)
    const freeUntil = clinic?.status === "prueba" ? clinic.trial_ends_at : clinic?.status === "activa" ? clinic.comp_until : null;
    const trialEnd = freeUntil ? Math.floor(Date.parse(freeUntil) / 1000) : 0;
    const keepTrial = trialEnd > Date.now() / 1000 + 49 * 3600;
    const base = await origin();
    const price = await priceFor(pc.plan);
    const session = await s.checkout.sessions.create({
      mode: "subscription",
      allow_promotion_codes: true,
      customer,
      client_reference_id: sub.clinicId,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { clinic_id: sub.clinicId, plan_code: c.data }, ...(keepTrial ? { trial_end: trialEnd } : {}) },
      locale: "es",
      success_url: `${base}/consultorio/suscripcion?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/consultorio/suscripcion?pago=cancelado`,
      custom_text: {
        submit: {
          message: `Se cobrarán $${pc.plan.price_mxn.toLocaleString("es-MX")} MXN (IVA incluido) cada mes${keepTrial ? " a partir del fin de tu prueba" : ""}. ` +
            "Te avisaremos 5 días antes de cada renovación y puedes cancelar cuando quieras desde VitalIA, sin penalización.",
        },
      },
    });
    return { url: session.url ?? undefined };
  } catch (e) { return { error: friendly(e) }; }
}

/** Cambiar de plan con una suscripción pagada: subir cobra la diferencia ahora; bajar la abona al siguiente recibo. */
export async function changePlan(code: string): Promise<ChooseResult> {
  const c = PlanCode.safeParse(code);
  if (!c.success) return { error: REASONS.plan };
  const o = await ownerSub();
  if ("error" in o) return { error: o.error };
  const { sub } = o;
  if (!sub.stripeSubscribed) return { error: "No tienes una suscripción pagada activa." };
  const pc = planCheck(sub, c.data);
  if ("error" in pc) return { error: pc.error };
  try {
    const s = stripe();
    const { data: clinic } = await createAdminClient().from("clinics").select("stripe_subscription_id").eq("id", sub.clinicId).single();
    const current = await s.subscriptions.retrieve(clinic!.stripe_subscription_id!);
    const upgrade = (pc.plan.price_mxn ?? 0) > (sub.plan.price_mxn ?? 0);
    const updated = await s.subscriptions.update(current.id, {
      items: [{ id: current.items.data[0].id, price: await priceFor(pc.plan) }],
      proration_behavior: current.status === "trialing" ? "none" : upgrade ? "always_invoice" : "create_prorations",
      payment_behavior: "error_if_incomplete",
      metadata: { clinic_id: sub.clinicId, plan_code: c.data },
    });
    await syncSubscription(updated);
  } catch (e) { return { error: friendly(e) }; }
  revalidatePath("/consultorio", "layout");
  return { ok: `Ahora tienes el plan ${pc.plan.name}.` };
}

/** Portal de Stripe para cambiar la tarjeta y ver recibos. */
export async function openPortal(): Promise<ChooseResult> {
  if (!billingConfigured()) return { error: "Los pagos en línea todavía no están configurados." };
  const o = await ownerSub();
  if ("error" in o) return { error: o.error };
  try {
    const { data: clinic } = await createAdminClient().from("clinics").select("stripe_customer_id").eq("id", o.sub.clinicId).single();
    if (!clinic?.stripe_customer_id) return { error: "Todavía no tienes un método de pago registrado." };
    const session = await stripe().billingPortal.sessions.create({
      customer: clinic.stripe_customer_id, configuration: await portalConfiguration(), locale: "es",
      return_url: `${await origin()}/consultorio/suscripcion`,
    });
    return { url: session.url };
  } catch (e) { return { error: friendly(e) }; }
}

const Fiscal = z.object({
  rfc: z.string().trim().toUpperCase().regex(RFC_RE, "RFC inválido: revisa letras y fecha (12 o 13 caracteres)."),
  legal_name: z.string().trim().toUpperCase().min(1, "Escribe la razón social o nombre.").max(300),
  tax_regime: z.string().regex(/^6\d{2}$/, "Elige el régimen fiscal."),
  zip: z.string().trim().regex(/^\d{5}$/, "El código postal debe tener 5 dígitos."),
  cfdi_use: z.enum(["G03", "S01"]),
  email: z.union([z.literal(""), z.string().trim().email("Correo inválido.")]),
});

/** Datos fiscales para el CFDI, tal como aparecen en la Constancia de Situación Fiscal. */
export async function saveBillingProfile(_: unknown, form: FormData): Promise<ChooseResult> {
  const o = await ownerSub();
  if ("error" in o) return { error: o.error };
  const p = Fiscal.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Revisa los datos." };
  const d = p.data;
  const supabase = await createClient();
  const { error } = await supabase.from("billing_profiles").upsert({
    clinic_id: o.sub.clinicId, rfc: d.rfc, legal_name: d.legal_name, tax_regime: d.tax_regime, zip: d.zip,
    cfdi_use: d.tax_regime === "616" ? "S01" : d.cfdi_use, email: d.email || null,
  });
  if (error) return { error: "No se pudieron guardar los datos fiscales." };
  revalidatePath("/consultorio/suscripcion");
  return { ok: "Datos fiscales guardados." };
}

/** Reintenta timbrar el CFDI de un pago del propio consultorio (p. ej., tras capturar los datos fiscales). */
export async function retryCfdi(invoiceId: string): Promise<ChooseResult> {
  const o = await ownerSub();
  if ("error" in o) return { error: o.error };
  if (!z.uuid().safeParse(invoiceId).success) return { error: "Pago inválido." };
  const supabase = await createClient();
  const { data: inv } = await supabase.from("billing_invoices").select("id").eq("id", invoiceId).maybeSingle();
  if (!inv) return { error: "Pago no encontrado." };
  const r = await issueCfdi(inv.id);
  revalidatePath("/consultorio/suscripcion");
  if (r.ok) return { ok: "Factura emitida y enviada a tu correo." };
  const msg: Record<string, string> = { sin_datos: "Primero captura tus datos fiscales.", no_configurado: "La facturación todavía no está configurada.", pendiente: "La factura ya se está procesando." };
  return { error: msg[r.status] ?? r.error ?? "No se pudo emitir la factura." };
}
