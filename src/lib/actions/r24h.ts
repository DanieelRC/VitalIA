"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, requireRole } from "@/lib/supabase/server";
import type { RecallPayload } from "@/components/r24h-editor";

const schema = z.object({
  recall_date: z.iso.date(),
  notes: z.string().max(5000),
  items: z.array(z.object({
    meal: z.string().max(60), time: z.string().max(10).optional(), place: z.string().max(100).optional(),
    description: z.string().min(1).max(300), food_id: z.uuid().nullable().optional(), quantity: z.number().min(0).max(100),
    kcal: z.number().min(0).max(20000), protein_g: z.number().min(0), fat_g: z.number().min(0), carbs_g: z.number().min(0),
    group_code: z.string().nullable().optional(),
  })).min(1).max(150),
});

function totals(items: RecallPayload["items"]) {
  const t = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein_g: a.protein_g + i.protein_g, fat_g: a.fat_g + i.fat_g, carbs_g: a.carbs_g + i.carbs_g }),
    { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * 10) / 10]));
}

async function insert(patientId: string, by: "nutriologo" | "paciente", payload: RecallPayload) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { error: "Datos inválidos." };
  const supabase = await createClient();
  const { error } = await supabase.from("recalls_24h").insert({
    patient_id: patientId, captured_by: by, recall_date: parsed.data.recall_date,
    items: parsed.data.items, totals: totals(parsed.data.items), notes: parsed.data.notes || null,
  });
  if (error) return { error: error.message };
  return { ok: "Recordatorio guardado." };
}

export async function staffSaveRecall(patientId: string, payload: RecallPayload) {
  await requireRole("nutriologo");
  const res = await insert(patientId, "nutriologo", payload);
  revalidatePath(`/consultorio/pacientes/${patientId}/r24h`);
  return res;
}

export async function patientSaveRecall(payload: RecallPayload) {
  const s = await requireRole("paciente");
  const res = await insert(s.patientId!, "paciente", payload);
  revalidatePath("/portal/r24h");
  return res;
}

export async function deleteRecall(id: string) {
  const supabase = await createClient();
  // RLS: el nutriólogo borra cualquiera; el paciente solo los que capturó
  await supabase.from("recalls_24h").delete().eq("id", id);
  revalidatePath("/portal/r24h");
  revalidatePath("/consultorio/pacientes", "layout");
}
