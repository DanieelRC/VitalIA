"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, requireRole } from "@/lib/supabase/server";

// Borradores del Copiloto de consulta. El asistente solo los propone en una tarjeta; estas acciones se ejecutan
// cuando el nutriólogo pulsa el botón, con su sesión (RLS), y siempre crean registros en estado «borrador».

const base = (id: string) => `/consultorio/pacientes/${id}`;
type Result = { href?: string; error?: string };

const planDraft = z.object({
  name: z.string().trim().min(1).max(200),
  kcal_target: z.number().min(300).max(10000),
  macros: z.object({
    mode: z.literal("porcentaje"),
    protein_g: z.number().min(0).max(600), fat_g: z.number().min(0).max(500), carbs_g: z.number().min(0).max(1200),
    protein_pct: z.number().min(0).max(100), fat_pct: z.number().min(0).max(100), carbs_pct: z.number().min(0).max(100),
  }),
  meals: z.array(z.object({
    name: z.string().trim().min(1).max(60), kcal_pct: z.number().min(0).max(100), equivalents: z.record(z.string(), z.number().min(0).max(50)),
  })).min(1).max(8),
  recommendations: z.string().max(10000).nullable(),
});

export async function applyPlanDraft(patientId: string, draft: unknown): Promise<Result> {
  await requireRole("nutriologo");
  const id = z.uuid().safeParse(patientId), d = planDraft.safeParse(draft);
  if (!id.success || !d.success) return { error: "El borrador no es válido. Pide al copiloto que lo proponga de nuevo." };
  if (Math.abs(d.data.meals.reduce((a, m) => a + m.kcal_pct, 0) - 100) > 0.5) return { error: "Los tiempos de comida no suman 100 %." };
  const supabase = await createClient();
  const { data: groups } = await supabase.from("equivalent_groups").select("code");
  const codes = new Set((groups ?? []).map((g) => g.code as string));
  const meals = d.data.meals.map((m) => ({ ...m, equivalents: Object.fromEntries(Object.entries(m.equivalents).filter(([c]) => codes.has(c))) }));
  const { data, error } = await supabase.from("meal_plans").insert({
    ...d.data, meals, patient_id: id.data, status: "borrador", menu: [], start_date: null,
    energy: { manual: 1, origen: "copiloto" }, // el editor respeta esta energía en vez de recalcularla
  }).select("id").single();
  if (error) return { error: "No se pudo crear el plan." };
  revalidatePath(`${base(id.data)}/plan`);
  return { href: `${base(id.data)}/plan/${data.id}` };
}

const noteDraft = z.object({
  reason: z.string().max(500).optional(),
  subjective: z.string().max(20000), objective: z.string().max(20000), assessment: z.string().max(20000), plan: z.string().max(20000),
  pes: z.array(z.object({
    domain: z.enum(["ingestion", "clinico", "conductual"]), problem: z.string().trim().min(2).max(300),
    etiology: z.string().trim().min(2).max(1000), signs: z.string().trim().min(2).max(1000),
  })).max(6),
});

export async function applyNoteDraft(patientId: string, draft: unknown): Promise<Result> {
  await requireRole("nutriologo");
  const id = z.uuid().safeParse(patientId), d = noteDraft.safeParse(draft);
  if (!id.success || !d.success) return { error: "El borrador no es válido. Pide al copiloto que lo redacte de nuevo." };
  const supabase = await createClient();
  const { pes, ...soap } = d.data;
  const { data, error } = await supabase.from("consultations").insert({ ...soap, patient_id: id.data }).select("id").single();
  if (error) return { error: "No se pudo crear la nota." };
  if (pes.length) await supabase.from("pes_diagnoses").insert(pes.map((p) => ({ ...p, consultation_id: data.id })));
  revalidatePath(`${base(id.data)}/expediente`);
  return { href: `${base(id.data)}/expediente/${data.id}` };
}
