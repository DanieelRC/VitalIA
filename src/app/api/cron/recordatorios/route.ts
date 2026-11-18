import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { cronAuthorized } from "@/lib/security";
import { escapeHtml, renderEmail } from "@/lib/email-layout";

// Vercel Cron: envía recordatorio por correo de las citas de las próximas 24 h.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new NextResponse("No autorizado", { status: 401 });
  const admin = createAdminClient();
  const now = new Date();
  const { data } = await admin.from("appointments").select("id, starts_at, clinic_id, patients(full_name, email)")
    .eq("status", "confirmada").is("reminder_sent_at", null)
    .gte("starts_at", now.toISOString()).lte("starts_at", new Date(now.getTime() + 864e5).toISOString());
  const { data: clinics } = await admin.from("clinic_settings").select("clinic_id, name, address, phone");
  const byClinic = new Map((clinics ?? []).map((c) => [c.clinic_id as string, c]));

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  let sent = 0;
  for (const a of data ?? []) {
    const p = a.patients as unknown as { full_name: string; email: string } | null;
    if (!p?.email) continue;
    const clinic = byClinic.get(a.clinic_id as string);
    const when = new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(a.starts_at));
    const details: [string, string][] = [["Fecha y hora", when], ["Consultorio", clinic?.name ?? "Tu consultorio"]];
    if (clinic?.address) details.push(["Dirección", clinic.address]);
    if (clinic?.phone) details.push(["Teléfono", clinic.phone]);
    const res = await sendEmail(p.email, `Recordatorio de tu cita en ${clinic?.name ?? "VitalIA"}`, renderEmail({
      preheader: `Te esperamos el ${when}.`,
      badge: { label: "Recordatorio", tone: "info" },
      title: "Tu cita es pronto",
      paragraphs: [`Hola ${escapeHtml(p.full_name.split(" ")[0])}, te recordamos tu próxima consulta de nutrición.`],
      details,
      cta: { label: "Ver mis citas", url: `${site}/portal/citas` },
      note: "Si no puedes asistir, cancélala desde tu portal para liberar el horario.",
      footer: "Recibes este correo porque tienes una cita confirmada con tu nutriólogo en VitalIA.",
    }));
    if (!("skipped" in res) && !res.error) {
      await admin.from("appointments").update({ reminder_sent_at: new Date().toISOString() }).eq("id", a.id);
      sent++;
    }
  }
  return NextResponse.json({ sent });
}
