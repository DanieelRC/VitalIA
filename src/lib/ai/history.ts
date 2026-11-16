import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/** Últimos mensajes del usuario con el asistente (para mostrar al abrir el chat). */
export async function chatHistory(userId: string, limit = 20) {
  const admin = createAdminClient();
  const [{ data }, { data: settings }] = await Promise.all([
    admin.from("ai_messages").select("role, content").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit),
    admin.from("ai_settings").select("max_input_chars, enabled").eq("id", 1).single(),
  ]);
  return {
    messages: (data ?? []).reverse() as { role: "user" | "assistant"; content: string }[],
    maxChars: settings?.max_input_chars ?? 1500,
    enabled: settings?.enabled ?? false,
  };
}
