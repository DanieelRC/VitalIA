import { R24hEditor, type Food } from "@/components/r24h-editor";
import { RecallList } from "@/components/recall-list";
import { Card } from "@/components/ui";
import { staffSaveRecall } from "@/lib/actions/r24h";
import { createClient } from "@/lib/supabase/server";

export default async function R24h({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [foods, plan, recalls] = await Promise.all([
    supabase.from("foods").select("id, name, portion, group_code, kcal, protein_g, fat_g, carbs_g").order("name"),
    supabase.from("meal_plans").select("kcal_target, macros").eq("patient_id", id).eq("status", "activo").maybeSingle(),
    supabase.from("recalls_24h").select("*").eq("patient_id", id).order("recall_date", { ascending: false }),
  ]);
  const target = plan.data ? { kcal: plan.data.kcal_target, protein_g: plan.data.macros.protein_g, fat_g: plan.data.macros.fat_g, carbs_g: plan.data.macros.carbs_g } : null;

  return (
    <div className="grid gap-4">
      <Card title="Recordatorio de 24 horas (método de pasos múltiples)">
        <p className="mb-3 text-sm text-muted">
          1) Lista rápida de lo consumido ayer · 2) Alimentos olvidados (bebidas, botanas, aderezos) · 3) Hora y lugar · 4) Detalle y cantidades · 5) Revisión final.
        </p>
        <R24hEditor foods={(foods.data ?? []) as Food[]} target={target} save={staffSaveRecall.bind(null, id)} />
      </Card>
      <Card title="Historial">
        <RecallList recalls={recalls.data ?? []} canDelete={() => true} />
      </Card>
    </div>
  );
}
