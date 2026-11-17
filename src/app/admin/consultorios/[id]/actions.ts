"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAdminAction, requireAdmin } from "@/lib/admin";
import { billingConfigured, priceFor, stripe } from "@/lib/billing/stripe";
import { syncSubscription } from "@/lib/billing/sync";
import { sendConfirmation } from "@/lib/confirmation";
import { createAdminClient } from "@/lib/supabase/server";

export type AdminResult = { ok?: string; error?: string };

const SNAP = "id, name, owner_id, plan, status, trial_ends_at, current_period_end, comp_until, cancel_at_period_end, stripe_subscription_id, ai_budget_override_usd";
const DAY = 864e5;

/** Fecha límite: «hasta» (fin del día en CDMX) o «días» desde hoy. Máximo un año. */
function untilFrom(fd: FormData): Date | string {
  const until = String(fd.get("until") ?? "");
  const days = Number(fd.get("days") ?? 0);
  const d = until ? new Date(`${until}T23:59:59-06:00`) : days > 0 ? new Date(Date.now() + Math.round(days) * DAY) : null;
  if (!d || Number.isNaN(d.getTime())) return "Indica los días o la fecha.";
  if (d.getTime() <= Date.now()) return "La fecha debe ser futura.";
  if (d.getTime() > Date.now() + 366 * DAY) return "Máximo un año.";
  return d;
}

/** Una sola acción despachada por «op». Cada cambio exige motivo y queda en la bitácora con el antes y el después. */
export async function runAdminAction(_: AdminResult, fd: FormData): Promise<AdminResult> {
  const s = await requireAdmin();
  const clinicId = String(fd.get("clinic_id") ?? "");
  const op = String(fd.get("op") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  if (!z.uuid().safeParse(clinicId).success) return { error: "Consultorio inválido." };
  if (reason.length < 3 || reason.length > 500) return { error: "Escribe el motivo (queda en la bitácora)." };

  const admin = createAdminClient();
  const { data: before } = await admin.from("clinics").select(SNAP).eq("id", clinicId).maybeSingle();
  if (!before) return { error: "No existe el consultorio." };
  const subId = before.stripe_subscription_id as string | null;
  let update: Record<string, unknown> | null = null;
  let message = "Listo.";

  try {
    switch (op) {
      case "trial": {
        const until = untilFrom(fd);
        if (typeof until === "string") return { error: until };
        if (subId) {
          if (!billingConfigured()) return { error: "Tiene suscripción de Stripe y los pagos no están configurados aquí." };
          // Con suscripción pagada: se pausa el cobro moviendo el fin de la prueba en Stripe
          const sub = await stripe().subscriptions.update(subId, { trial_end: Math.floor(until.getTime() / 1000), proration_behavior: "none" });
          await syncSubscription(sub);
        } else {
          update = { status: "prueba", trial_ends_at: until.toISOString(), comp_until: null, cancel_at_period_end: false };
        }
        message = `Prueba gratis hasta el ${until.toLocaleDateString("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" })}.`;
        break;
      }
      case "comp": {
        if (subId) return { error: "Tiene una suscripción pagada: usa «Prueba gratis» para pausar sus cobros." };
        const until = untilFrom(fd);
        if (typeof until === "string") return { error: until };
        update = { status: "activa", comp_until: until.toISOString(), current_period_end: until.toISOString(), cancel_at_period_end: false };
        message = "Cortesía otorgada.";
        break;
      }
      case "comp_remove":
        if (!before.comp_until) return { error: "No tiene cortesía." };
        update = { comp_until: null, status: "vencida", current_period_end: new Date().toISOString() };
        message = "Cortesía retirada; el consultorio quedó vencido.";
        break;
      case "plan": {
        const code = z.enum(["p5", "p10", "p20", "pmax"]).safeParse(fd.get("plan"));
        if (!code.success) return { error: "Plan inválido." };
        const { data: plan } = await admin.from("plans").select("code, name, max_patients, price_mxn").eq("code", code.data).single();
        const { count } = await admin.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("active", true);
        if (plan!.max_patients != null && (count ?? 0) > plan!.max_patients) return { error: `Tiene ${count} pacientes activos y ese plan incluye ${plan!.max_patients}.` };
        if (subId) {
          if (!billingConfigured() || plan!.price_mxn == null) return { error: "No se puede cambiar la suscripción de Stripe desde aquí." };
          const s0 = await stripe().subscriptions.retrieve(subId);
          const sub = await stripe().subscriptions.update(subId, {
            items: [{ id: s0.items.data[0].id, price: await priceFor({ ...plan!, price_mxn: Number(plan!.price_mxn) }) }],
            proration_behavior: "create_prorations", metadata: { ...s0.metadata, plan_code: code.data },
          });
          await syncSubscription(sub);
        } else update = { plan: code.data };
        message = `Plan cambiado a ${plan!.name}.`;
        break;
      }
      case "suspend":
        if (subId) return { error: "Tiene una suscripción pagada: cancélala primero en Stripe para no seguir cobrando." };
        update = { status: "vencida", current_period_end: new Date().toISOString(), comp_until: null };
        message = "Consultorio suspendido: conserva su información pero no puede agregar pacientes ni usar la IA.";
        break;
      case "reactivate":
        if (subId) return { error: "Tiene una suscripción pagada; su estado lo controla Stripe." };
        update = { status: "activa", current_period_end: null, comp_until: null, cancel_at_period_end: false };
        message = "Activado sin cobro y sin vencimiento.";
        break;
      case "ai_budget": {
        const raw = String(fd.get("ai_budget") ?? "").trim();
        const v = raw === "" ? null : Number(raw);
        if (v != null && (!Number.isFinite(v) || v < 0 || v > 1000)) return { error: "Tope inválido (0 a 1000 USD)." };
        update = { ai_budget_override_usd: v };
        message = v == null ? "Se usará el tope del plan." : `Tope de IA: $${v} USD al mes.`;
        break;
      }
      case "resend_confirmation": {
        if (!before.owner_id) return { error: "No tiene titular." };
        const { data: u } = await admin.auth.admin.getUserById(before.owner_id);
        if (!u.user?.email) return { error: "No se encontró el correo del titular." };
        if (u.user.email_confirmed_at) return { error: "El correo ya está confirmado." };
        if (!(await sendConfirmation(u.user.email))) return { error: "No se pudo generar el enlace." };
        message = "Enlace de confirmación reenviado.";
        break;
      }
      default:
        return { error: "Acción desconocida." };
    }
    if (update) {
      const { error } = await admin.from("clinics").update(update).eq("id", clinicId);
      if (error) return { error: error.message };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo completar la acción." };
  }

  const { data: after } = await admin.from("clinics").select(SNAP).eq("id", clinicId).maybeSingle();
  await logAdminAction({ adminId: s.userId, clinicId, action: op, reason, before, after });
  revalidatePath(`/admin/consultorios/${clinicId}`);
  revalidatePath("/admin", "layout");
  return { ok: message };
}
