import { notFound } from "next/navigation";
import { getGroups, getLatestAnthropometry, getPatient, type MealPlan } from "@/lib/data";
import { ageFromBirthDate } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";
import { PlanEditor } from "./plan-editor";

export default async function PlanPage({ params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  const supabase = await createClient();
  const [patient, groups, last, recipes, plan] = await Promise.all([
    getPatient(id), getGroups(), getLatestAnthropometry(id),
    supabase.from("recipes").select("id, name, meal_time, tags, kcal").order("name"),
    planId === "nuevo" ? Promise.resolve({ data: null }) : supabase.from("meal_plans").select("*").eq("id", planId).eq("patient_id", id).single(),
  ]);
  if (planId !== "nuevo" && !plan.data) notFound();

  const lean = Number(last?.results?.masa_libre_grasa_kg?.value) || undefined;
  return (
    <PlanEditor
      patientId={id}
      planId={planId === "nuevo" ? null : planId}
      initial={plan.data as MealPlan | null}
      person={{
        sex: patient.sex ?? "F",
        age: patient.birth_date ? ageFromBirthDate(patient.birth_date) : 30,
        weightKg: Number(last?.weight_kg) || 70,
        heightCm: Number(last?.height_cm) || 165,
        leanKg: lean,
        adjustedKg: Number(last?.results?.peso_ajustado?.value) || undefined,
        missing: !patient.sex || !patient.birth_date || !last?.weight_kg,
      }}
      groups={groups}
      recipes={recipes.data ?? []}
      pathologies={patient.pathologies}
    />
  );
}
