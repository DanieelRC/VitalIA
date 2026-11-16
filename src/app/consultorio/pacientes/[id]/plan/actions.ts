"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { scaleTemplate } from "@/lib/nutrition/templates";
import { createClient, requireRole } from "@/lib/supabase/server";

const planSchema = z.object({
  name: z.string().trim().min(1).max(200),
  status: z.enum(["borrador", "activo", "archivado"]),
  start_date: z.string().nullable(),
  energy: z.record(z.string(), z.union([z.number(), z.string()])),
  kcal_target: z.number().min(300).max(10000),
  macros: z.object({
    mode: z.enum(["porcentaje", "gkg"]),
    protein_pct: z.number().optional(), fat_pct: z.number().optional(), carbs_pct: z.number().optional(),
    protein_gkg: z.number().optional(), fat_gkg: z.number().optional(),
    protein_g: z.number(), fat_g: z.number(), carbs_g: z.number(),
  }),
  meals: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    kcal_pct: z.number().min(0).max(100),
    equivalents: z.record(z.string(), z.number().min(0).max(50)),
  })).min(1).max(8),
  menu: z.array(z.object({
    day: z.number().int().min(1).max(7), meal: z.number().int().min(0).max(7),
    recipe_id: z.uuid().nullable().optional(), text: z.string().max(300).optional(),
  })).max(56),
  recommendations: z.string().max(10000).nullable(),
});
export type PlanPayload = z.infer<typeof planSchema>;

export async function savePlan(patientId: string, planId: string | null, payload: PlanPayload) {
  await requireRole("nutriologo");
  const parsed = planSchema.safeParse(payload);
  if (!parsed.success) return { error: "Datos inválidos: " + parsed.error.issues[0].path.join(".") + " " + parsed.error.issues[0].message };
  const pctSum = parsed.data.meals.reduce((a, m) => a + m.kcal_pct, 0);
  if (Math.abs(pctSum - 100) > 0.5) return { error: `La distribución por tiempos suma ${pctSum} %; debe sumar 100 %.` };

  const supabase = await createClient();
  if (parsed.data.status === "activo") {
    let q = supabase.from("meal_plans").update({ status: "archivado" }).eq("patient_id", patientId).eq("status", "activo");
    if (planId) q = q.neq("id", planId);
    await q;
  }
  const row = { ...parsed.data, patient_id: patientId, updated_at: new Date().toISOString() };
  const res = planId
    ? await supabase.from("meal_plans").update(row).eq("id", planId).select("id").single()
    : await supabase.from("meal_plans").insert(row).select("id").single();
  if (res.error) return { error: res.error.message };
  revalidatePath(`/consultorio/pacientes/${patientId}/plan`);
  return { ok: true, id: res.data.id as string };
}

/** Guarda un plan existente como plantilla reutilizable (sin datos del paciente). */
export async function saveAsTemplate(patientId: string, planId: string) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { data: p } = await supabase.from("meal_plans").select("name, kcal_target, energy, macros, meals, menu, recommendations").eq("id", planId).eq("patient_id", patientId).single();
  if (!p) return;
  await supabase.from("plan_templates").insert({ ...p, name: `${p.name} · ${Math.round(p.kcal_target)} kcal` });
  revalidatePath(`/consultorio/pacientes/${patientId}/plan`);
}

/** Crea un plan en borrador a partir de una plantilla, ajustado a la energía indicada. */
export async function applyTemplate(patientId: string, _: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const d = z.object({ template_id: z.uuid(), kcal: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(300).max(10000).optional()) })
    .safeParse({ template_id: fd.get("template_id"), kcal: fd.get("kcal") });
  if (!d.success) return { error: "Elige una plantilla y una energía válida (300–10 000 kcal)." };
  const supabase = await createClient();
  const { data: tpl } = await supabase.from("plan_templates").select("name, kcal_target, energy, macros, meals, menu, recommendations").eq("id", d.data.template_id).single();
  if (!tpl) return { error: "Plantilla no encontrada." };
  const { data: groups } = await supabase.from("equivalent_groups").select("code, kcal");
  const groupKcal = Object.fromEntries((groups ?? []).map((g) => [g.code, Number(g.kcal)]));
  const scaled = scaleTemplate(tpl as Parameters<typeof scaleTemplate>[0] & typeof tpl, d.data.kcal ?? Number(tpl.kcal_target), groupKcal);
  const { data, error } = await supabase.from("meal_plans")
    .insert({ ...scaled, name: tpl.name.replace(/ · \d+ kcal$/, ""), patient_id: patientId, status: "borrador", energy: { ...(tpl.energy as object), manual: 1, from_template: tpl.name } }) // manual: el editor respeta esta energía en vez de recalcular con los datos de otro paciente
    .select("id").single();
  if (error) return { error: "No se pudo crear el plan." };
  redirect(`/consultorio/pacientes/${patientId}/plan/${data.id}`);
}

export async function deleteTemplate(patientId: string, templateId: string) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from("plan_templates").delete().eq("id", templateId);
  revalidatePath(`/consultorio/pacientes/${patientId}/plan`);
}

export async function deletePlan(patientId: string, planId: string) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from("meal_plans").delete().eq("id", planId);
  revalidatePath(`/consultorio/pacientes/${patientId}/plan`);
}
