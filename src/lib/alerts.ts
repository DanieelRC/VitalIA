// Alertas de seguimiento para el nutriólogo. `classifyAlerts` es lógica pura; `followUpAlerts` consulta la base.
import type { SupabaseClient } from "@supabase/supabase-js";

export type AlertKind = "alarma" | "apego" | "inactivo" | "fotos";
export type FollowUpAlert = { patientId: string; name: string; kind: AlertKind; text: string };

type Input = {
  patients: { id: string; full_name: string; user_id: string | null; activated_at: string | null }[];
  activity: { patient_id: string; at: string }[];                       // cualquier registro del paciente
  adherence: { patient_id: string; logged_at: string; adherence: number | null }[];
  flagged: { user_id: string; reason: string; at: string }[];            // mensajes al asistente que activaron el filtro
  pendingPhotos: { patient_id: string }[];
  now: Date;
};

const DAY = 864e5;
const ORDER: AlertKind[] = ["alarma", "apego", "inactivo", "fotos"];

export function classifyAlerts({ patients, activity, adherence, flagged, pendingPhotos, now }: Input): FollowUpAlert[] {
  const out: FollowUpAlert[] = [];
  for (const p of patients) {
    const add = (kind: AlertKind, text: string) => out.push({ patientId: p.id, name: p.full_name, kind, text });

    const flags = flagged.filter((f) => f.user_id === p.user_id);
    if (flags.length) {
      const ed = flags.some((f) => f.reason === "eating_disorder");
      add("alarma", ed ? "Mencionó al asistente conductas de riesgo alimentario" : "Describió al asistente un síntoma de urgencia");
    }

    const last3 = adherence.filter((a) => a.patient_id === p.id && a.adherence != null).sort((a, b) => b.logged_at.localeCompare(a.logged_at)).slice(0, 3);
    if (last3.length >= 2 && last3.reduce((s, a) => s + a.adherence!, 0) / last3.length <= 2) add("apego", "Reporta que le está costando seguir el plan");

    // Solo cuenta como inactivo quien ya activó su cuenta hace más de 14 días
    if (p.user_id && p.activated_at && now.getTime() - new Date(p.activated_at).getTime() > 14 * DAY) {
      const last = activity.filter((a) => a.patient_id === p.id).map((a) => new Date(a.at).getTime()).sort((a, b) => b - a)[0];
      if (!last || now.getTime() - last > 14 * DAY) {
        add("inactivo", last ? `Sin registros desde hace ${Math.floor((now.getTime() - last) / DAY)} días` : "No ha registrado nada desde que activó su cuenta");
      }
    }

    const photos = pendingPhotos.filter((f) => f.patient_id === p.id).length;
    if (photos) add("fotos", `${photos} foto${photos > 1 ? "s" : ""} de comida por comentar`);
  }
  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.name.localeCompare(b.name, "es"));
}

export async function followUpAlerts(supabase: SupabaseClient): Promise<FollowUpAlert[]> {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY).toISOString();
  const since14 = new Date(now.getTime() - 14 * DAY).toISOString();
  const [patients, progress, daily, recalls, photos, flagged] = await Promise.all([
    supabase.from("patients").select("id, full_name, user_id, privacy_accepted_at").eq("active", true),
    supabase.from("progress_logs").select("patient_id, logged_at, adherence, created_at").gte("created_at", since30),
    supabase.from("daily_logs").select("patient_id, created_at").gte("created_at", since30),
    supabase.from("recalls_24h").select("patient_id, created_at").eq("captured_by", "paciente").gte("created_at", since30),
    supabase.from("meal_photos").select("patient_id, created_at, comment").gte("created_at", since30),
    supabase.from("ai_messages").select("user_id, blocked_reason, created_at").eq("role", "user").not("blocked_reason", "is", null).gte("created_at", since14),
  ]);
  return classifyAlerts({
    now,
    patients: (patients.data ?? []).map((p) => ({ id: p.id, full_name: p.full_name, user_id: p.user_id, activated_at: p.privacy_accepted_at })),
    activity: [...(progress.data ?? []), ...(daily.data ?? []), ...(recalls.data ?? []), ...(photos.data ?? [])].map((r) => ({ patient_id: r.patient_id, at: r.created_at })),
    adherence: progress.data ?? [],
    flagged: (flagged.data ?? []).map((f) => ({ user_id: f.user_id, reason: f.blocked_reason as string, at: f.created_at })),
    pendingPhotos: (photos.data ?? []).filter((p) => !p.comment),
  });
}
