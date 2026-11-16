import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Group } from "@/lib/nutrition";

export type Patient = {
  id: string; user_id: string | null; full_name: string; email: string; phone: string | null; birth_date: string | null;
  sex: "M" | "F" | null; occupation: string | null; goal: string | null; pathologies: string[]; allergies: string[];
  medications: string | null; personal_history: string | null; family_history: string | null; gyneco_history: string | null;
  lifestyle: Record<string, string>; diet_history: string | null; active: boolean; invited_at: string | null;
  privacy_accepted_at: string | null; created_at: string;
};

export type MealPlan = {
  id: string; patient_id: string; name: string; status: "borrador" | "activo" | "archivado"; start_date: string | null;
  energy: Record<string, number | string>; kcal_target: number;
  macros: { mode?: string; protein_pct?: number; fat_pct?: number; carbs_pct?: number; protein_gkg?: number; fat_gkg?: number; protein_g: number; fat_g: number; carbs_g: number };
  meals: { name: string; kcal_pct: number; equivalents: Record<string, number> }[];
  menu: { day: number; meal: number; recipe_id?: string | null; text?: string }[];
  recommendations: string | null; created_at: string;
};

export const getGroups = cache(async (): Promise<Group[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("equivalent_groups").select("*").order("sort");
  return (data ?? []) as Group[];
});

export const getPatient = cache(async (id: string): Promise<Patient> => {
  const supabase = await createClient();
  const { data } = await supabase.from("patients").select("*").eq("id", id).single();
  if (!data) notFound();
  return data as Patient;
});

export const getLatestAnthropometry = cache(async (patientId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("anthropometry").select("*").eq("patient_id", patientId)
    .order("measured_at", { ascending: false }).limit(1).maybeSingle();
  return data as { weight_kg: number | null; height_cm: number | null; results: Record<string, { value: number | string }> ; measured_at: string } | null;
});

export const groupLabel = (g: Pick<Group, "name" | "subgroup">) => (g.subgroup ? `${g.name} · ${g.subgroup}` : g.name);

export const RECIPE_TAGS: Record<string, string> = {
  normal: "Normal", diabetes: "Diabetes", hipertension: "Hipertensión", renal: "Renal (ERC)",
  dislipidemia: "Dislipidemia", celiaquia: "Celiaquía", sii: "Intestino irritable", embarazo: "Embarazo",
  vegetariana: "Vegetariana", alta_proteina: "Alta en proteína",
};
export const MEAL_TIMES: Record<string, string> = { desayuno: "Desayuno", colacion: "Colación", comida: "Comida", cena: "Cena" };
