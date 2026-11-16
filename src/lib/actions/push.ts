"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { isValidTime } from "@/lib/reminders";
import { createClient, requireRole } from "@/lib/supabase/server";

const subSchema = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(4).max(100) }),
});

/** Guarda la suscripción push de este dispositivo. */
export async function saveSubscription(input: unknown) {
  const s = await requireRole("paciente");
  const d = subSchema.safeParse(input);
  if (!d.success) return { error: "Suscripción no válida." };
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions")
    .upsert({ patient_id: s.patientId, endpoint: d.data.endpoint, p256dh: d.data.keys.p256dh, auth: d.data.keys.auth }, { onConflict: "endpoint" });
  return error ? { error: "No se pudo activar en este dispositivo." } : { ok: true };
}

export async function removeSubscription(endpoint: string) {
  await requireRole("paciente");
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

/** Preferencias: hora de cada comida, agua y día de pesarse. */
export async function saveReminderPrefs(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("paciente");
  const labels = fd.getAll("meal_label").map(String);
  const times = fd.getAll("meal_time").map(String);
  const meals = labels.map((label, i) => ({ label: label.trim().slice(0, 60), time: times[i] ?? "" })).filter((m) => m.label && m.time);
  if (meals.some((m) => !isValidTime(m.time)) || meals.length > 8) return { error: "Revisa las horas de tus comidas." };
  const weigh = fd.get("weigh_day");
  const weigh_day = weigh === "" || weigh == null ? null : Number(weigh);
  if (weigh_day != null && !(Number.isInteger(weigh_day) && weigh_day >= 0 && weigh_day <= 6)) return { error: "Día no válido." };

  const supabase = await createClient();
  const { error } = await supabase.from("reminder_prefs")
    .upsert({ patient_id: s.patientId, meals, water: fd.get("water") === "on", weigh_day, updated_at: new Date().toISOString() }, { onConflict: "patient_id" });
  if (error) return { error: "No se pudieron guardar tus recordatorios." };
  revalidatePath("/portal/recordatorios");
  return { ok: "Recordatorios guardados." };
}
