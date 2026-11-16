"use server";
import { revalidatePath } from "next/cache";
import { createClient, requireRole } from "@/lib/supabase/server";
import { ageFromBirthDate, evaluateMeasurement } from "@/lib/nutrition";
import type { FormState } from "@/components/form";

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : undefined;
};
const pick = (fd: FormData, prefix: string, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, num(fd.get(`${prefix}_${k}`))]).filter(([, v]) => v !== undefined));

import { BIA, CIRC, DIAM, FOLDS } from "./fields";

export async function saveMeasurement(patientId: string, _: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { data: p } = await supabase.from("patients").select("sex, birth_date").eq("id", patientId).single();
  if (!p?.sex || !p.birth_date) return { error: "Registra sexo y fecha de nacimiento del paciente para calcular los indicadores." };

  const m = {
    weight_kg: num(fd.get("weight_kg")), height_cm: num(fd.get("height_cm")),
    circumferences: pick(fd, "c", CIRC), skinfolds: pick(fd, "s", FOLDS),
    diameters: pick(fd, "d", DIAM), bia: pick(fd, "b", BIA),
  };
  if (!m.weight_kg && !m.height_cm) return { error: "Captura al menos peso o talla." };
  const measured_at = String(fd.get("measured_at") || new Date().toISOString().slice(0, 10));
  const results = evaluateMeasurement(m, p.sex, ageFromBirthDate(p.birth_date, new Date(measured_at)));

  const { error } = await supabase.from("anthropometry").insert({
    patient_id: patientId, measured_at, ...m, results, notes: String(fd.get("notes") ?? "") || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/consultorio/pacientes/${patientId}/antropometria`);
  return { ok: "Medición guardada y evaluada." };
}

export async function deleteMeasurement(patientId: string, mid: string) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from("anthropometry").delete().eq("id", mid);
  revalidatePath(`/consultorio/pacientes/${patientId}/antropometria`);
}
