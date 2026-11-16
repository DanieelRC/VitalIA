import { AssistantChat } from "@/components/assistant-chat";
import { Alert, PageHeader } from "@/components/ui";
import { chatHistory } from "@/lib/ai/history";
import { requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Asistente Vita" };

export default async function PatientAssistant() {
  const s = await requireRole("paciente");
  const h = await chatHistory(s.userId);
  return (
    <>
      <PageHeader title="Vita, tu asistente de nutrición" subtitle="Resuelve dudas sobre tu plan, equivalentes y recetas." />
      {!h.enabled && <div className="mb-3"><Alert tone="warn">El asistente no está disponible por ahora. Escribe a tu nutriólogo por Mensajes.</Alert></div>}
      <AssistantChat initial={h.messages} maxChars={h.maxChars}
        disclaimer="Vita es una inteligencia artificial: no sustituye a tu nutriólogo ni da diagnósticos. En una urgencia llama al 911."
        suggestions={["¿Con qué puedo cambiar la tortilla?", "Dame una idea de cena con mis equivalentes", "¿Cuánta agua debo tomar?"]} />
    </>
  );
}
