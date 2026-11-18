import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { escapeHtml, renderEmail } from "@/lib/email-layout";

const WINDOW_MS = 12 * 36e5;

/**
 * Aviso por correo al consultorio cuando un paciente escribe a Vita algo que sugiere una urgencia.
 * Como máximo un correo por paciente cada 12 h (las siguientes quedan en la alarma del inicio).
 * El correo no incluye el texto del mensaje: solo quién y dónde revisarlo.
 */
export async function notifyCrisis(admin: SupabaseClient, userId: string, clinicId: string) {
  try {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count } = await admin.from("ai_messages").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("role", "user").eq("blocked_reason", "emergency").gte("created_at", since);
    if ((count ?? 0) > 1) return; // el mensaje actual ya está guardado: más de uno = ya se avisó

    const [{ data: p }, { data: c }] = await Promise.all([
      admin.from("patients").select("id, full_name").eq("user_id", userId).eq("clinic_id", clinicId).maybeSingle(),
      admin.from("clinic_settings").select("email").eq("clinic_id", clinicId).maybeSingle(),
    ]);
    if (!p || !c?.email) return;
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    await sendEmail(c.email, "VitalIA: un paciente podría necesitar atención urgente", renderEmail({
      preheader: "Un paciente escribió a Vita algo que podría ser una urgencia.",
      badge: { label: "Urgente", tone: "danger" },
      title: "Un paciente podría necesitar atención",
      paragraphs: [
        `<strong>${escapeHtml(p.full_name)}</strong> escribió al asistente Vita un mensaje que podría indicar una urgencia (síntoma de alarma o ideas de hacerse daño).`,
        "Vita le respondió con el 911 y la Línea de la Vida (800 911 2000). Te sugerimos contactarlo lo antes posible.",
      ],
      cta: { label: "Abrir sus mensajes", url: `${site}/consultorio/mensajes/${p.id}` },
      note: "Por privacidad, este correo no incluye el contenido del mensaje. Recibirás como máximo un aviso por paciente cada 12 horas.",
      footer: "Recibes este aviso porque eres el consultorio de este paciente en VitalIA.",
    }));
  } catch {
    // El aviso nunca debe impedir la respuesta de crisis al paciente; la alarma del inicio sigue visible.
  }
}
