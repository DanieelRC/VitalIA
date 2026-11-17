import "server-only";
import { createAdminClient, getSession } from "@/lib/supabase/server";
import type { CalcResult } from "./calc";

/** Últimos mensajes del usuario con el asistente (para mostrar al abrir el chat). */
export async function chatHistory(userId: string, limit = 20, patientId?: string) {
  const admin = createAdminClient();
  const clinicId = (await getSession())?.clinicId ?? "00000000-0000-0000-0000-000000000000";
  const [{ data }, { data: settings }] = await Promise.all([
    (patientId
      ? admin.from("ai_messages").select("role, content, cards").eq("user_id", userId).eq("patient_id", patientId)
      : admin.from("ai_messages").select("role, content, cards").eq("user_id", userId).is("patient_id", null)
    ).order("created_at", { ascending: false }).limit(limit),
    admin.from("ai_settings").select("max_input_chars, enabled").eq("clinic_id", clinicId).maybeSingle(),
  ]);
  return {
    messages: (data ?? []).reverse() as { role: "user" | "assistant"; content: string; cards?: CalcResult[] | null }[],
    maxChars: settings?.max_input_chars ?? 1500,
    enabled: settings?.enabled ?? false,
  };
}
