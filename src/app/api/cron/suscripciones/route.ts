import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
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
    const price = plan?.price_mxn != null ? ` por <strong>$${Number(plan.price_mxn).toLocaleString("es-MX")} MXN (IVA incluido)</strong>` : "";
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const res = await sendEmail(cs.email, "Tu suscripción de VitalIA se renueva pronto",
      `<p>Hola. La suscripción de <strong>${escapeHtml(c.name)}</strong> (plan ${escapeHtml(plan?.name ?? c.plan)}) se renovará automáticamente el
       <strong>${fmt(c.current_period_end!)}</strong>${price}.</p>
       <p>Si no quieres renovarla, puedes cancelarla en cualquier momento y sin penalización desde
       <a href="${site}/consultorio/suscripcion">Suscripción</a>. Seguirás teniendo acceso hasta el final del periodo pagado.</p>`);
    if ("error" in res && res.error) continue;
    await admin.from("clinics").update({ renewal_notice_for: c.current_period_end }).eq("id", c.id);
    notified++;
  }
  return NextResponse.json({ closed, notified });
}
