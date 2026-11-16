"use server";
import { createClient, getSession } from "@/lib/supabase/server";

/** Envía un mensaje. El paciente solo escribe en su propio hilo (RLS lo exige también). */
export async function sendMessage(targetPatientId: string | null, body: string) {
  const s = await getSession();
  if (!s) return { error: "Sesión expirada." };
  const patientId = s.role === "paciente" ? s.patientId : targetPatientId;
  const text = body.trim().slice(0, 4000);
  if (!patientId || !text) return { error: "Mensaje vacío." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("messages")
    .insert({ patient_id: patientId, sender_id: s.userId, body: text })
    .select("id, patient_id, sender_id, body, created_at").single();
  return error ? { error: error.message } : { message: data };
}
