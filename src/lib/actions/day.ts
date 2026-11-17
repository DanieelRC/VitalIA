"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, requireRole } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/time";

const patch = z.object({
  water_glasses: z.number().int().min(0).max(30).optional(),
  satiety: z.number().int().min(1).max(5).optional(),
  digestion: z.number().int().min(1).max(5).optional(),
  energy: z.number().int().min(1).max(5).optional(),
}).refine((d) => Object.keys(d).length > 0);

/** Guarda el registro de hoy del paciente (agua y cómo se siente). Un registro por día. */
export async function saveDay(input: z.input<typeof patch>) {
  const s = await requireRole("paciente");
  const parsed = patch.safeParse(input);
  if (!parsed.success) return { error: "Dato no válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("daily_logs")
    .upsert({ patient_id: s.patientId, day: todayLocal(), ...parsed.data }, { onConflict: "patient_id,day" });
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };
  revalidatePath("/portal");
  return { ok: true };
}

/** Marca (o desmarca) una comida de hoy como hecha. */
export async function checkMeal(meal: number, done: boolean) {
  const s = await requireRole("paciente");
  if (!Number.isInteger(meal) || meal < 0 || meal > 7) return { error: "Comida no válida." };
  const supabase = await createClient();
  const { error } = await supabase.from("meal_checks")
    .upsert({ patient_id: s.patientId, day: todayLocal(), meal, done: !!done, updated_at: new Date().toISOString() }, { onConflict: "patient_id,day,meal" });
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };
  revalidatePath("/portal");
  return { ok: true };
}

/** Cambia el platillo de una comida solo por hoy (o vuelve al del plan con `null`). */
export async function swapMeal(meal: number, recipeId: string | null) {
  const s = await requireRole("paciente");
  if (!Number.isInteger(meal) || meal < 0 || meal > 7) return { error: "Comida no válida." };
  if (recipeId !== null && !z.uuid().safeParse(recipeId).success) return { error: "Receta no válida." };
  const supabase = await createClient();
  if (recipeId) {
    const { data } = await supabase.from("recipes").select("id").eq("id", recipeId).maybeSingle();
    if (!data) return { error: "Esa receta ya no está disponible." };
  }
  const { error } = await supabase.from("meal_checks")
    .upsert({ patient_id: s.patientId, day: todayLocal(), meal, recipe_id: recipeId, updated_at: new Date().toISOString() }, { onConflict: "patient_id,day,meal" });
  if (error) return { error: "No se pudo cambiar el platillo. Intenta de nuevo." };
  revalidatePath("/portal");
  return { ok: true };
}

/** Registro rápido del peso de hoy. */
export async function quickWeight(kg: number): Promise<{ ok?: true; error?: string }> {
  const s = await requireRole("paciente");
  if (!Number.isFinite(kg) || kg < 20 || kg > 400) return { error: "Revisa el peso." };
  const supabase = await createClient();
  const { error } = await supabase.from("progress_logs").insert({ patient_id: s.patientId, logged_at: todayLocal(), weight_kg: Math.round(kg * 10) / 10 });
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };
  revalidatePath("/portal");
  revalidatePath("/portal/progreso");
  return { ok: true };
}
