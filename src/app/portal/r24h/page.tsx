import { R24hEditor, type Food } from "@/components/r24h-editor";
import { RecallList } from "@/components/recall-list";
import { Card, PageHeader } from "@/components/ui";
import { patientSaveRecall } from "@/lib/actions/r24h";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Recordatorio de 24 horas" };

export default async function PatientR24h() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const [foods, recalls] = await Promise.all([
    supabase.from("foods").select("id, name, portion, group_code, kcal, protein_g, fat_g, carbs_g").order("name"),
    supabase.from("my_recalls").select("*").eq("patient_id", s.patientId!).order("recall_date", { ascending: false }).limit(20),
  ]);
  return (
    <>
      <PageHeader title="Recordatorio de 24 horas" subtitle="Anota todo lo que comiste y bebiste ayer, desde que te levantaste hasta que te dormiste." />
      <Card className="mb-4">
        <ul className="mb-4 list-disc pl-5 text-sm text-muted">
          <li>Incluye bebidas, aderezos, salsas, botanas y lo que comiste fuera de casa.</li>
          <li>Busca el alimento en la lista para que se calcule; si no aparece, escríbelo con la cantidad (ej. «2 tacos de pastor»).</li>
          <li>Las porciones son de la lista de equivalentes (ej. 1 tortilla, 1/2 taza de arroz).</li>
        </ul>
        <R24hEditor foods={(foods.data ?? []) as Food[]} save={patientSaveRecall} />
      </Card>
      <Card title="Mis recordatorios">
        <RecallList recalls={recalls.data ?? []} canDelete={(r) => r.captured_by === "paciente"} />
      </Card>
    </>
  );
}
