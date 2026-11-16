import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { cronAuthorized, escapeHtml } from "@/lib/security";

// Vercel Cron: envía recordatorio por correo de las citas de las próximas 24 h.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new NextResponse("No autorizado", { status: 401 });
  const admin = createAdminClient();
  const now = new Date();
  const { data } = await admin.from("appointments").select("id, starts_at, patients(full_name, email)")
    .eq("status", "confirmada").is("reminder_sent_at", null)
    .gte("starts_at", now.toISOString()).lte("starts_at", new Date(now.getTime() + 864e5).toISOString());
  const { data: clinic } = await admin.from("clinic_settings").select("name, address, phone").eq("id", 1).single();

  let sent = 0;
  for (const a of data ?? []) {
    const p = a.patients as unknown as { full_name: string; email: string } | null;
    if (!p?.email) continue;
    const when = new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(a.starts_at));
    const res = await sendEmail(p.email, `Recordatorio de tu cita en ${clinic?.name ?? "VitalIA"}`,
      `<p>Hola ${escapeHtml(p.full_name.split(" ")[0])}, te recordamos tu cita el <strong>${escapeHtml(when)}</strong>.</p>
       <p>${escapeHtml(clinic?.address ?? "")} ${clinic?.phone ? `· ${escapeHtml(clinic.phone)}` : ""}</p>
       <p>Si no puedes asistir, cancélala desde tu portal.</p>`);
    if (!("skipped" in res) && !res.error) {
      await admin.from("appointments").update({ reminder_sent_at: new Date().toISOString() }).eq("id", a.id);
      sent++;
    }
  }
  return NextResponse.json({ sent });
}
