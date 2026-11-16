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
      <PageHeader title="Asistente clínico" subtitle="Cálculos, menús, borradores de SOAP/PES y evidencia de suplementos." />
      {!h.enabled && <div className="mb-3"><Alert tone="warn">El asistente está desactivado en Ajustes.</Alert></div>}
      <AssistantChat initial={h.messages} maxChars={h.maxChars}
        disclaimer="Asistente de IA (Grok). Todo es un borrador: verifica antes de usarlo clínicamente. Evita datos identificables."
        suggestions={["Calcula GEB por Mifflin y Valencia: mujer 34 años, 78 kg, 160 cm", "Propón un menú de 1600 kcal para diabetes tipo 2", "Redacta un PES para ingestión excesiva de sodio"]} />
    </>
  );
}
