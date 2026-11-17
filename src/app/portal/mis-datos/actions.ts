"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { ageFrom, recordAcceptance } from "@/lib/legal";
import { createClient, requireRole } from "@/lib/supabase/server";

export async function requestArco(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("paciente");
  const d = z.object({
    kind: z.enum(["acceso", "rectificacion", "cancelacion", "oposicion", "revocacion"], "Elige qué quieres solicitar"),
    details: z.string().trim().min(10, "Describe tu solicitud (mínimo 10 caracteres)").max(2000),
  }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("arco_requests").insert({ ...d.data, patient_id: s.patientId, requested_by: s.userId });
  if (error) return { error: error.message.includes("demasiadas") ? error.message : "No se pudo enviar la solicitud." };
  revalidatePath("/portal/mis-datos");
  return { ok: "Solicitud enviada. Tu nutriólogo tiene hasta 20 días hábiles para responderte." };
}

/** Aceptar la versión vigente del aviso (cuando cambió o no hay evidencia previa). */
export async function acceptNotice(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("paciente");
  if (fd.get("privacy") !== "on") return { error: "Marca la casilla para aceptar el aviso." };
  const supabase = await createClient();
  const { data: me } = await supabase.from("my_patient").select("birth_date").single();
  const minor = (ageFrom(me?.birth_date) ?? 99) < 18;
  const tutor = String(fd.get("tutor_name") ?? "").trim().slice(0, 160);
  if (minor && tutor.length < 5) return { error: "Escribe el nombre completo de tu madre, padre o tutor." };
  await recordAcceptance({ userId: s.userId, document: "aviso_paciente", patientId: s.patientId, tutorName: minor ? tutor : null });
  await supabase.rpc("accept_privacy");
  revalidatePath("/portal/mis-datos");
  return { ok: "Gracias. Quedó registrada tu aceptación." };
}
