"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, requireRole } from "@/lib/supabase/server";
import type { FormState } from "@/components/form";

const p = (id: string) => `/consultorio/pacientes/${id}/indicaciones`;
const s = z.string().max(500).optional().transform((v) => v || null);

export async function assignSupplement(patientId: string, _: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const d = z.object({ supplement_id: z.uuid(), dose: s, schedule: s, notes: s }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: "Elige un suplemento." };
  const supabase = await createClient();
  const { error } = await supabase.from("patient_supplements").insert({ ...d.data, patient_id: patientId });
  if (error) return { error: error.message };
  revalidatePath(p(patientId));
  return { ok: "Suplemento indicado." };
}

export async function assignRoutine(patientId: string, _: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const d = z.object({ routine_id: z.uuid(), frequency: s, notes: s }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: "Elige una rutina." };
  const supabase = await createClient();
  const { error } = await supabase.from("patient_routines").insert({ ...d.data, patient_id: patientId });
  if (error) return { error: error.message };
  revalidatePath(p(patientId));
  return { ok: "Rutina asignada." };
}

export async function toggleAssignment(patientId: string, table: "patient_supplements" | "patient_routines", id: string, active: boolean) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from(table).update({ active }).eq("id", id);
  revalidatePath(p(patientId));
}
