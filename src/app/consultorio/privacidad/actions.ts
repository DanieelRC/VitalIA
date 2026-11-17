"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { LEGAL } from "@/lib/legal";
import { createClient, requireRole } from "@/lib/supabase/server";

export async function respondArco(id: string, _: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const d = z.object({
    status: z.enum(["en_proceso", "procedente", "improcedente"]),
    response: z.string().trim().max(4000),
  }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: "Revisa el estado y la respuesta." };
  if (d.data.status !== "en_proceso" && d.data.response.length < 10) return { error: "Escribe la respuesta para la persona (qué se hizo o por qué no procede)." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("arco_requests").update({ status: d.data.status, response: d.data.response || null }).eq("id", id).select("id");
  if (error || !data?.length) return { error: "No se pudo guardar la respuesta." };
  revalidatePath("/consultorio/privacidad");
  return { ok: "Respuesta guardada. La persona la ve en su portal." };
}

/** Constancia de un aviso firmado en papel en consulta. */
export async function recordPaperConsent(patientId: string, _: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("nutriologo");
  const d = z.object({
    date: z.iso.date("Indica la fecha de firma"),
    tutor_name: z.string().trim().max(160).optional(),
    confirm: z.literal("on", "Confirma que tienes el documento firmado"),
  }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };
  if (d.data.date > new Date().toISOString().slice(0, 10)) return { error: "La fecha no puede ser futura." };
  const supabase = await createClient();
  const { error } = await supabase.from("legal_acceptances").insert({
    patient_id: patientId, document: "aviso_paciente", version: LEGAL.versions.aviso_paciente, method: "papel",
    tutor_name: d.data.tutor_name || null, recorded_by: s.userId, accepted_at: new Date(d.data.date + "T12:00:00Z").toISOString(),
  });
  if (error) return { error: "No se pudo registrar el consentimiento." };
  await supabase.from("patients").update({ privacy_accepted_at: new Date(d.data.date + "T12:00:00Z").toISOString() }).eq("id", patientId).is("privacy_accepted_at", null);
  revalidatePath("/consultorio/privacidad");
  return { ok: "Consentimiento registrado. Guarda el documento firmado junto con el expediente." };
}
