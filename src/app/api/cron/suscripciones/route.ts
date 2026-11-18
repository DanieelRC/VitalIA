import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-layout";
import { cronAuthorized, escapeHtml } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/server";

const fmt = (d: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(new Date(d));

/**
 * Cron diario de suscripciones:
 * 1) cierra los periodos vencidos (prueba o pago) y aplica las cancelaciones pedidas;
 * 2) avisa al titular al menos 5 días naturales antes de cada renovación automática (LFPC, art. 76 Bis).
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new NextResponse("No autorizado", { status: 401 });
  const admin = createAdminClient();
  const { data: closed } = await admin.rpc("close_clinic_periods");

  const now = Date.now();
  const { data: due } = await admin.from("clinics")
    .select("id, name, plan, current_period_end, renewal_notice_for, plans(name, price_mxn)")
    .eq("status", "activa").eq("cancel_at_period_end", false)
    .gt("current_period_end", new Date(now).toISOString())
    .lte("current_period_end", new Date(now + 6 * 864e5).toISOString());
  let notified = 0;
  for (const c of due ?? []) {
    if (c.renewal_notice_for === c.current_period_end) continue;
    const { data: cs } = await admin.from("clinic_settings").select("email").eq("clinic_id", c.id).maybeSingle();
    if (!cs?.email) continue;
    const plan = c.plans as unknown as { name: string; price_mxn: number | null } | null;
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const details: [string, string][] = [["Plan", plan?.name ?? c.plan], ["Fecha de renovación", fmt(c.current_period_end!)]];
    if (plan?.price_mxn != null) details.push(["Importe", `$${Number(plan.price_mxn).toLocaleString("es-MX")} MXN (IVA incluido)`]);
    const res = await sendEmail(cs.email, "Tu suscripción de VitalIA se renueva pronto", renderEmail({
      preheader: `Se renovará automáticamente el ${fmt(c.current_period_end!)}.`,
      badge: { label: "Aviso de renovación", tone: "info" },
      title: "Tu suscripción se renueva pronto",
      paragraphs: [
        `La suscripción de <strong>${escapeHtml(c.name)}</strong> se renovará automáticamente.`,
        "Si no quieres renovarla, puedes cancelarla en cualquier momento y sin penalización. Seguirás teniendo acceso hasta el final del periodo pagado.",
      ],
      details,
      cta: { label: "Administrar mi suscripción", url: `${site}/consultorio/suscripcion` },
      footer: "Te avisamos al menos 5 días antes de cada cobro automático, como lo pide la Ley Federal de Protección al Consumidor.",
    }));
    if ("error" in res && res.error) continue;
    await admin.from("clinics").update({ renewal_notice_for: c.current_period_end }).eq("id", c.id);
    notified++;
  }
  return NextResponse.json({ closed, notified });
}
