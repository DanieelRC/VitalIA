"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, requireRole } from "@/lib/supabase/server";
import type { FormState } from "@/components/form";
import { verifiedFileType } from "@/lib/security";

const num = z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(",", "."))), z.number().min(0).max(100000).nullable());
const txt = (max = 2000) => z.string().trim().max(max).optional().transform((v) => v || null);
const lines = (v: unknown) => String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

// ---------- Alimentos ----------
export async function saveFood(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const d = z.object({
    name: z.string().trim().min(2).max(200), group_code: txt(40), portion: z.string().trim().min(1).max(100),
    portion_g: num, kcal: num, protein_g: num, fat_g: num, carbs_g: num, fiber_g: num, sodium_mg: num,
  }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: "Revisa los datos del alimento." };
  const supabase = await createClient();
  const { error } = await supabase.from("foods").insert({ ...d.data, kcal: d.data.kcal ?? 0, protein_g: d.data.protein_g ?? 0, fat_g: d.data.fat_g ?? 0, carbs_g: d.data.carbs_g ?? 0 });
  if (error) return { error: error.message };
  revalidatePath("/consultorio/alimentos");
  return { ok: "Alimento agregado." };
}

export async function deleteRow(table: "foods" | "recipes" | "supplements" | "exercises" | "routines", id: string, back: string) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id).eq("is_base", false);
  if (error) throw new Error(error.code === "23503" ? "Está asignado a pacientes; no puede eliminarse." : error.message);
  revalidatePath(back);
}

// ---------- Recetas ----------
export async function saveRecipe(id: string | null, _: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const raw = Object.fromEntries(fd);
  const base = z.object({
    name: z.string().trim().min(2).max(200), description: txt(1000),
    meal_time: z.enum(["desayuno", "colacion", "comida", "cena"]),
    servings: z.coerce.number().int().min(1).max(50), prep_minutes: num,
  }).safeParse(raw);
  if (!base.success) return { error: "Revisa nombre, tiempo y porciones." };

  const ingredients = lines(raw.ingredients).map((l) => {
    const m = l.match(/^([\d.,/ ]+)\s*([^\s]+)?\s+(.+)$/);
    return m ? { quantity: m[1].trim(), unit: m[2] ?? "", name: m[3] } : { quantity: "", unit: "", name: l };
  });
  const equivalents = Object.fromEntries(
    [...fd.entries()].filter(([k, v]) => k.startsWith("eq_") && Number(v) > 0).map(([k, v]) => [k.slice(3), Number(v)]),
  );
  const supabase = await createClient();
  const { data: groups } = await supabase.from("equivalent_groups").select("code, kcal, protein_g, fat_g, carbs_g");
  const t = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
  for (const g of groups ?? []) {
    const k = equivalents[g.code] ?? 0;
    t.kcal += k * g.kcal; t.protein_g += k * g.protein_g; t.fat_g += k * g.fat_g; t.carbs_g += k * g.carbs_g;
  }
  const row = {
    ...base.data, ingredients, steps: lines(raw.steps), equivalents,
    tags: fd.getAll("tags").map(String),
    kcal: Math.round(t.kcal), protein_g: Math.round(t.protein_g * 10) / 10, fat_g: Math.round(t.fat_g * 10) / 10, carbs_g: Math.round(t.carbs_g * 10) / 10,
  };
  const res = id
    ? await supabase.from("recipes").update(row).eq("id", id).select("id").single()
    : await supabase.from("recipes").insert(row).select("id").single();
  if (res.error) return { error: res.error.message };
  revalidatePath("/consultorio/recetas");
  redirect(`/consultorio/recetas/${res.data.id}`);
}

export async function duplicate(table: "recipes" | "routines", id: string) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("*").eq("id", id).single();
  if (!data) return;
  const rest = { ...data };
  delete rest.id;
  delete rest.created_at;
  if ("image_path" in rest) rest.image_path = null; // la copia no comparte la foto
  const { data: copy, error } = await supabase.from(table).insert({ ...rest, name: `${rest.name} (copia)`, is_base: false }).select("id").single();
  if (error) throw new Error(error.message);
  redirect(table === "recipes" ? `/consultorio/recetas/${copy.id}/editar` : `/consultorio/ejercicios/rutinas/${copy.id}`);
}

// ---------- Suplementos ----------
export async function saveSupplement(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const d = z.object({
    name: z.string().trim().min(2).max(200), category: txt(100), presentation: txt(100), typical_dose: txt(200),
    indications: txt(), contraindications: txt(), interactions: txt(), evidence: z.enum(["A", "B", "C"]).nullable().optional(), notes: txt(),
  }).safeParse({ ...Object.fromEntries(fd), evidence: fd.get("evidence") || null });
  if (!d.success) return { error: "Revisa los datos." };
  const supabase = await createClient();
  const { error } = await supabase.from("supplements").insert(d.data);
  if (error) return { error: error.message };
  revalidatePath("/consultorio/suplementos");
  return { ok: "Suplemento agregado." };
}

// ---------- Ejercicios y rutinas ----------
export async function saveExercise(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const d = z.object({
    name: z.string().trim().min(2).max(200), type: z.enum(["aerobico", "anaerobico", "flexibilidad"]),
    muscle_group: txt(100), equipment: txt(100), met: num, description: txt(), video_url: z.url().optional().or(z.literal("")).transform((v) => v || null),
  }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: "Revisa los datos (la URL de video debe ser válida)." };
  const supabase = await createClient();
  const { error } = await supabase.from("exercises").insert(d.data);
  if (error) return { error: error.message };
  revalidatePath("/consultorio/ejercicios");
  return { ok: "Ejercicio agregado." };
}

export type RoutineItem = { exercise_id?: string; name: string; sets?: number; reps?: string; rest_s?: number; duration_min?: number; intensity?: string };

export async function saveRoutine(id: string | null, payload: {
  name: string; type: "aerobico" | "anaerobico" | "mixto"; level: string; goal: string; notes: string; items: RoutineItem[];
}) {
  await requireRole("nutriologo");
  const d = z.object({
    name: z.string().trim().min(2).max(200), type: z.enum(["aerobico", "anaerobico", "mixto"]),
    level: z.enum(["principiante", "intermedio", "avanzado"]), goal: z.string().max(300), notes: z.string().max(3000),
    items: z.array(z.object({
      exercise_id: z.string().optional(), name: z.string().min(1).max(200), sets: z.number().optional(), reps: z.string().max(40).optional(),
      rest_s: z.number().optional(), duration_min: z.number().optional(), intensity: z.string().max(100).optional(),
    })).min(1).max(40),
  }).safeParse(payload);
  if (!d.success) return { error: "Revisa la rutina (nombre y al menos un ejercicio)." };
  const supabase = await createClient();
  const res = id
    ? await supabase.from("routines").update(d.data).eq("id", id).select("id").single()
    : await supabase.from("routines").insert(d.data).select("id").single();
  if (res.error) return { error: res.error.message };
  revalidatePath("/consultorio/ejercicios");
  return { ok: "Rutina guardada.", id: res.data.id as string };
}

// ---------- Foto de receta ----------
/** Sube la foto del platillo preparado. Las recetas del catálogo base son compartidas entre consultorios: para ponerles foto se duplican. */
export async function uploadRecipeImage(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const session = await requireRole("nutriologo");
  if (!z.uuid().safeParse(id).success) return { error: "Receta no válida." };
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige una foto." };
  if (file.size > 5 * 1024 * 1024) return { error: "La foto supera 5 MB." };
  const type = await verifiedFileType(file, ["image/jpeg", "image/png", "image/webp"]);
  if (!type) return { error: "Formato no permitido. Usa JPG, PNG o WEBP." };
  const supabase = await createClient();
  const { data: prev } = await supabase.from("recipes").select("image_path, clinic_id").eq("id", id).maybeSingle();
  if (!prev) return { error: "Receta no encontrada." };
  if (!prev.clinic_id) return { error: "Esta receta es del catálogo base. Duplícala para ponerle tu propia foto." };
  const path = `${session.clinicId}/${id}/${crypto.randomUUID()}.${type.ext}`;
  const up = await supabase.storage.from("recipes").upload(path, file, { contentType: type.mime });
  if (up.error) return { error: "No se pudo subir la foto. Intenta de nuevo." };
  const { error } = await supabase.from("recipes").update({ image_path: path }).eq("id", id);
  if (error) { await supabase.storage.from("recipes").remove([path]); return { error: error.message }; }
  if (prev.image_path) await supabase.storage.from("recipes").remove([prev.image_path]);
  revalidatePath("/consultorio/recetas");
  revalidatePath(`/consultorio/recetas/${id}`);
  return { ok: "Foto guardada." };
}

export async function removeRecipeImage(id: string) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("image_path").eq("id", id).maybeSingle();
  if (!data?.image_path) return;
  const { error } = await supabase.from("recipes").update({ image_path: null }).eq("id", id);
  if (!error) await supabase.storage.from("recipes").remove([data.image_path]);
  revalidatePath("/consultorio/recetas");
  revalidatePath(`/consultorio/recetas/${id}`);
}
