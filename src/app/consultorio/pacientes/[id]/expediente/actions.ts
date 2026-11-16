"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, requireRole } from "@/lib/supabase/server";
import type { FormState } from "@/components/form";
import { localToISO } from "@/lib/time";

const path = (pid: string, cid?: string) => `/consultorio/pacientes/${pid}/expediente${cid ? `/${cid}` : ""}`;

export async function createConsultation(patientId: string) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { data, error } = await supabase.from("consultations").insert({ patient_id: patientId }).select("id").single();
  if (error) throw new Error(error.message);
  redirect(path(patientId, data.id));
}

const soap = z.object({
  consulted_at: z.string().min(1),
  reason: z.string().max(500).optional(),
  subjective: z.string().max(20000).optional(),
  objective: z.string().max(20000).optional(),
  assessment: z.string().max(20000).optional(),
  plan: z.string().max(20000).optional(),
});

export async function saveSoap(patientId: string, cid: string, _: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const parsed = soap.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Revisa los campos." };
  const supabase = await createClient();
  const sign = fd.get("intent") === "sign";
  const { error } = await supabase.from("consultations")
    .update({ ...parsed.data, consulted_at: localToISO(parsed.data.consulted_at), ...(sign ? { status: "firmada" } : {}) })
    .eq("id", cid);
  if (error) return { error: error.message };
  revalidatePath(path(patientId, cid));
  return { ok: sign ? "Nota firmada. Ya no puede modificarse; usa adendas para correcciones." : "Borrador guardado." };
}

export async function addPes(patientId: string, cid: string, _: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const parsed = z.object({
    domain: z.enum(["ingestion", "clinico", "conductual"]),
    problem: z.string().trim().min(2).max(300),
    etiology: z.string().trim().min(2).max(1000),
    signs: z.string().trim().min(2).max(1000),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Completa problema, etiología y signos/síntomas." };
  const supabase = await createClient();
  const { error } = await supabase.from("pes_diagnoses").insert({ ...parsed.data, consultation_id: cid });
  if (error) return { error: error.message };
  revalidatePath(path(patientId, cid));
  return { ok: "Diagnóstico agregado." };
}

export async function deletePes(patientId: string, cid: string, pesId: string) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from("pes_diagnoses").delete().eq("id", pesId);
  revalidatePath(path(patientId, cid));
}

export async function addAddendum(patientId: string, cid: string, _: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { error: "Escribe la adenda." };
  const supabase = await createClient();
  const { error } = await supabase.from("consultation_addenda").insert({ consultation_id: cid, body });
  if (error) return { error: error.message };
  revalidatePath(path(patientId, cid));
  return { ok: "Adenda agregada." };
}

export async function deleteDraft(patientId: string, cid: string) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from("consultations").delete().eq("id", cid).eq("status", "borrador");
  redirect(path(patientId));
}
