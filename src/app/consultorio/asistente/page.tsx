import { AssistantChat } from "@/components/assistant-chat";
import { Alert, PageHeader } from "@/components/ui";
import { chatHistory } from "@/lib/ai/history";
import { requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Asistente IA" };

export default async function ProAssistant() {
  const s = await requireRole("nutriologo");
  const h = await chatHistory(s.userId);
  return (
    <>
      <PageHeader title="Asistente clínico" subtitle="Calcula con las fórmulas de la app, consulta a tus pacientes por nombre y redacta borradores." />
      {!h.enabled && <div className="mb-3"><Alert tone="warn">El asistente está desactivado en Ajustes.</Alert></div>}
      <AssistantChat initial={h.messages} maxChars={h.maxChars}
        disclaimer="Asistente de IA (Grok). Las cifras de las tarjetas salen de las fórmulas de la app, no del modelo. Los datos del paciente que consultes se envían al proveedor de IA. Todo es un borrador a revisar."
        suggestions={["Calcula GEB y GET por Mifflin y Valencia: mujer de 34 años, 78 kg, 160 cm, actividad ligera", "Distribuye 1800 kcal con 1.6 g/kg de proteína y 30 % de lípidos para 70 kg, y pásalo a equivalentes", "Zonas de entrenamiento para 45 años con FC en reposo de 62"]} />
    </>
  );
}
