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
