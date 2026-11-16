import { NextResponse } from "next/server";
import { pushConfigured, sendPush, type PushPayload } from "@/lib/push";
import { dueReminders, type ReminderPrefs } from "@/lib/reminders";
import { cronAuthorized } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/server";
import { CLINIC_TZ, isoToLocal } from "@/lib/time";

const WINDOW_MIN = 15;
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Cron cada 15 minutos: envía los recordatorios que tocan (comidas, agua, peso) y los de citas del día siguiente.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new NextResponse("No autorizado", { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ sent: 0, skipped: "sin llaves VAPID" });

  const admin = createAdminClient();
  const now = new Date();
  const local = isoToLocal(now); // "YYYY-MM-DDTHH:mm" en hora del consultorio
  const clock = {
    date: local.slice(0, 10),
    minutes: Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16)),
    weekday: WEEKDAY[new Intl.DateTimeFormat("en-US", { timeZone: CLINIC_TZ, weekday: "short" }).format(now)],
  };

  const [{ data: subs }, { data: prefs }, { data: appts }] = await Promise.all([
    admin.from("push_subscriptions").select("id, patient_id, endpoint, p256dh, auth"),
    admin.from("reminder_prefs").select("patient_id, meals, water, weigh_day"),
    admin.from("appointments").select("id, patient_id, starts_at").eq("status", "confirmada")
      .gte("starts_at", new Date(now.getTime() + 23 * 36e5).toISOString()).lte("starts_at", new Date(now.getTime() + 24 * 36e5).toISOString()),
  ]);
  const byPatient = new Map<string, NonNullable<typeof subs>>();
  for (const s of subs ?? []) byPatient.set(s.patient_id, [...(byPatient.get(s.patient_id) ?? []), s]);

  const queue: { patientId: string; key: string; payload: PushPayload }[] = [];
  for (const p of prefs ?? []) {
    if (!byPatient.has(p.patient_id)) continue;
    for (const r of dueReminders(p as unknown as ReminderPrefs, clock, WINDOW_MIN)) {
      queue.push({ patientId: p.patient_id, key: r.key, payload: { title: r.title, body: r.body, url: r.url, tag: r.key } });
    }
  }
  for (const a of appts ?? []) {
    if (!byPatient.has(a.patient_id)) continue;
    const when = new Intl.DateTimeFormat("es-MX", { timeZone: CLINIC_TZ, weekday: "long", hour: "numeric", minute: "2-digit" }).format(new Date(a.starts_at));
    queue.push({ patientId: a.patient_id, key: `cita-${a.id}`, payload: { title: "Tu cita es mañana", body: `Te esperamos el ${when}.`, url: "/portal/citas", tag: `cita-${a.id}` } });
  }

  let sent = 0;
  for (const item of queue) {
    // La llave única evita repetir el aviso si el cron corre dos veces en la misma ventana
    const { error } = await admin.from("push_log").insert({ patient_id: item.patientId, key: item.key });
    if (error) continue;
    for (const s of byPatient.get(item.patientId) ?? []) {
      const res = await sendPush(s, item.payload);
      if (res === "sent") sent++;
      if (res === "gone") await admin.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  await admin.from("push_log").delete().lt("sent_at", new Date(now.getTime() - 3 * 864e5).toISOString());
  return NextResponse.json({ due: queue.length, sent });
}
