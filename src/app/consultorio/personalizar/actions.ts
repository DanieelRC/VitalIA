"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, requireRole } from "@/lib/supabase/server";
import { validateFormula } from "@/lib/nutrition";
import { FAMILY_ORDER } from "@/lib/groups";

type Result = { ok: true } | { error: string };
const done = (): Result => { revalidatePath("/consultorio", "layout"); return { ok: true }; };
const fail = (e: { message: string; code?: string } | null, dup = "Ya existe uno con ese nombre."): Result => ({ error: e?.code === "23505" ? dup : e?.message ?? "No se pudo guardar." });
const name = z.string().trim().min(1).max(80);
const note = z.string().trim().max(300).nullish().transform((v) => v || null);
const pct = z.number().min(0).max(100);

// ---------- Distribuciones de macronutrientes ----------
export async function saveMacroPreset(input: { name: string; protein_pct: number; fat_pct: number; carbs_pct: number; note?: string | null }): Promise<Result> {
  await requireRole("nutriologo");
  const d = z.object({ name, protein_pct: pct, fat_pct: pct, carbs_pct: pct, note }).safeParse(input);
  if (!d.success) return { error: "Revisa el nombre y los porcentajes." };
  if (Math.abs(d.data.protein_pct + d.data.fat_pct + d.data.carbs_pct - 100) > 0.1) return { error: "Los porcentajes deben sumar 100 %." };
  const { error } = await (await createClient()).from("macro_presets").insert(d.data);
  return error ? fail(error) : done();
}

// ---------- Distribuciones por tiempos de comida ----------
export async function saveMealPreset(input: { name: string; meals: { name: string; kcal_pct: number }[] }): Promise<Result> {
  await requireRole("nutriologo");
  const d = z.object({ name, meals: z.array(z.object({ name: z.string().trim().min(1).max(60), kcal_pct: pct })).min(1).max(8) }).safeParse(input);
  if (!d.success) return { error: "Revisa los tiempos de comida." };
  if (Math.abs(d.data.meals.reduce((a, m) => a + m.kcal_pct, 0) - 100) > 0.5) return { error: "Los tiempos deben sumar 100 %." };
  const { error } = await (await createClient()).from("meal_presets").insert(d.data);
  return error ? fail(error) : done();
}

// ---------- Fórmulas propias ----------
export async function saveFormula(input: { id?: string; name: string; expression: string; note?: string | null }): Promise<Result> {
  await requireRole("nutriologo");
  const d = z.object({ id: z.uuid().optional(), name, expression: z.string().trim().min(1).max(300), note }).safeParse(input);
  if (!d.success) return { error: "Revisa el nombre y la fórmula." };
  const bad = validateFormula(d.data.expression);
  if (bad) return { error: `La fórmula no es válida: ${bad}` };
  const supabase = await createClient();
  const { id, ...row } = d.data;
  const { error } = id ? await supabase.from("custom_formulas").update(row).eq("id", id) : await supabase.from("custom_formulas").insert(row);
  return error ? fail(error) : done();
}

// ---------- Factores de actividad y estrés ----------
export async function saveFactor(input: { kind: "actividad" | "estres"; label: string; value: number }): Promise<Result> {
  await requireRole("nutriologo");
  const d = z.object({ kind: z.enum(["actividad", "estres"]), label: name, value: z.number().min(0.5).max(3) }).safeParse(input);
  if (!d.success) return { error: "El factor debe estar entre 0.5 y 3." };
  const { error } = await (await createClient()).from("custom_factors").insert(d.data);
  return error ? fail(error) : done();
}

// ---------- Campos propios de la historia clínica ----------
export async function saveField(input: { label: string; kind: "texto" | "numero" | "si_no" | "lista"; options?: string[] }): Promise<Result> {
  await requireRole("nutriologo");
  const d = z.object({ label: name, kind: z.enum(["texto", "numero", "si_no", "lista"]), options: z.array(z.string().trim().min(1).max(60)).max(20).default([]) }).safeParse(input);
  if (!d.success) return { error: "Revisa el campo." };
  if (d.data.kind === "lista" && d.data.options.length < 2) return { error: "Una lista necesita al menos dos opciones." };
  const key = "c_" + d.data.label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36);
  if (key.length < 3) return { error: "El nombre del campo debe tener letras." };
  const supabase = await createClient();
  const { count } = await supabase.from("custom_fields").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("custom_fields").insert({ ...d.data, key, sort: count ?? 0 });
  return error ? fail(error, "Ya existe un campo con ese nombre.") : done();
}

// ---------- Plantillas de nota SOAP ----------
export async function saveSoapTemplate(input: { name: string; reason?: string; subjective?: string; objective?: string; assessment?: string; plan?: string }): Promise<Result> {
  await requireRole("nutriologo");
  const t = z.string().trim().max(4000).optional().transform((v) => v || null);
  const d = z.object({ name, reason: t, subjective: t, objective: t, assessment: t, plan: t }).safeParse(input);
  if (!d.success) return { error: "Revisa la plantilla." };
  const { error } = await (await createClient()).from("soap_templates").insert(d.data);
  return error ? fail(error) : done();
}

const CONFIG_TABLES = ["macro_presets", "meal_presets", "custom_formulas", "custom_factors", "custom_fields", "soap_templates"] as const;
export async function deleteConfig(table: (typeof CONFIG_TABLES)[number], id: string): Promise<Result> {
  await requireRole("nutriologo");
  if (!CONFIG_TABLES.includes(table) || !z.uuid().safeParse(id).success) return { error: "Solicitud inválida." };
  const { error } = await (await createClient()).from(table).delete().eq("id", id);
  return error ? fail(error) : done();
}

// ---------- Grupos de equivalentes ----------
const groupValues = z.object({ kcal: z.number().min(0).max(1000), protein_g: z.number().min(0).max(100), fat_g: z.number().min(0).max(100), carbs_g: z.number().min(0).max(200) });

export async function saveGroupValues(code: string, input: { kcal: number; protein_g: number; fat_g: number; carbs_g: number }): Promise<Result> {
  await requireRole("nutriologo");
  const d = groupValues.safeParse(input);
  if (!d.success || !/^[a-z0-9_]{2,60}$/.test(code)) return { error: "Revisa el aporte del grupo." };
  const { error } = await (await createClient()).from("equivalent_groups").update(d.data).eq("code", code);
  return error ? fail(error) : done();
}

export async function resetGroup(code: string): Promise<Result> {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { data } = await supabase.from("equivalent_groups").select("base_values").eq("code", code).maybeSingle();
  const base = groupValues.safeParse(data?.base_values);
  if (!base.success) return { error: "Este grupo no tiene valores originales." };
  const { error } = await supabase.from("equivalent_groups").update(base.data).eq("code", code);
  return error ? fail(error) : done();
}

export async function createGroup(input: { family: string; name: string; subgroup?: string; kcal: number; protein_g: number; fat_g: number; carbs_g: number }): Promise<Result> {
  await requireRole("nutriologo");
  const d = groupValues.extend({ family: z.enum(FAMILY_ORDER as [string, ...string[]]), name, subgroup: z.string().trim().max(60).optional().transform((v) => v || null) }).safeParse(input);
  if (!d.success) return { error: "Revisa los datos del grupo." };
  const slug = `${d.data.name} ${d.data.subgroup ?? ""}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
  // El prefijo de la familia decide el color del grupo en toda la app
  const code = `${d.data.family}_x_${slug}`;
  const supabase = await createClient();
  const { data: last } = await supabase.from("equivalent_groups").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("equivalent_groups").insert({ ...d.data, code, is_custom: true, sort: (last?.sort ?? 0) + 1 });
  return error ? fail(error, "Ya existe un grupo con ese nombre.") : done();
}

export async function deleteGroup(code: string): Promise<Result> {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { count } = await supabase.from("foods").select("id", { count: "exact", head: true }).eq("group_code", code);
  if (count) return { error: `Hay ${count} alimentos en este grupo; reasígnalos antes de eliminarlo.` };
  const { error } = await supabase.from("equivalent_groups").delete().eq("code", code).eq("is_custom", true);
  return error ? fail(error) : done();
}

// ---------- Documentos (PDF) ----------
export async function savePdfBranding(input: { pdf_accent: string; pdf_footer?: string | null; pdf_sections: Record<string, boolean> }): Promise<Result> {
  const s = await requireRole("nutriologo");
  const d = z.object({
    pdf_accent: z.string().regex(/^#[0-9a-fA-F]{6}$/), pdf_footer: z.string().trim().max(200).nullish().transform((v) => v || null),
    pdf_sections: z.object({ equivalentes: z.boolean(), menu: z.boolean(), recomendaciones: z.boolean(), intercambios: z.boolean() }),
  }).safeParse(input);
  if (!d.success) return { error: "Revisa el color y las secciones." };
  const { error } = await (await createClient()).from("clinic_settings").update({ ...d.data, updated_at: new Date().toISOString() }).eq("clinic_id", s.clinicId!);
  return error ? fail(error) : done();
}
