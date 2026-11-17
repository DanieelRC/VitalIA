import { notFound } from "next/navigation";
import { getGroups, getLatestAnthropometry, getPatient, type MealPlan } from "@/lib/data";
import { ageFromBirthDate } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";
import { PlanEditor, type StudioConfig } from "./plan-editor";

export default async function PlanPage({ params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  const supabase = await createClient();
  const [patient, groups, last, recipes, plan, macroPresets, mealPresets, formulas, factors] = await Promise.all([
    getPatient(id), getGroups(), getLatestAnthropometry(id),
    supabase.from("recipes").select("id, name, meal_time, tags, kcal").order("name"),
    planId === "nuevo" ? Promise.resolve({ data: null }) : supabase.from("meal_plans").select("*").eq("id", planId).eq("patient_id", id).single(),
    supabase.from("macro_presets").select("id, name, protein_pct, fat_pct, carbs_pct, note").order("name"),
    supabase.from("meal_presets").select("id, name, meals").order("name"),
    supabase.from("custom_formulas").select("id, name, expression").order("name"),
    supabase.from("custom_factors").select("id, kind, label, value").order("value"),
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
      config={{
        macroPresets: (macroPresets.data ?? []).map((p) => ({ ...p, protein_pct: Number(p.protein_pct), fat_pct: Number(p.fat_pct), carbs_pct: Number(p.carbs_pct) })),
        mealPresets: (mealPresets.data ?? []) as StudioConfig["mealPresets"],
        formulas: formulas.data ?? [],
        factors: (factors.data ?? []) as StudioConfig["factors"],
      }}
    />
  );
}
