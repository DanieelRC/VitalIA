"use server";
import { revalidatePath } from "next/cache";
import { createClient, getSession } from "@/lib/supabase/server";
import type { FormState } from "@/components/form";
import { verifiedFileType } from "@/lib/security";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX = 10 * 1024 * 1024;
const CATEGORIES = ["laboratorio", "estudio", "foto", "otro"];

/** Sube un archivo al expediente. El paciente solo puede subir al suyo (también lo exige RLS). */
export async function uploadAttachment(targetPatientId: string | null, _: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s) return { error: "Sesión expirada." };
  const patientId = s.role === "paciente" ? s.patientId : targetPatientId;
  if (!patientId) return { error: "Paciente no válido." };

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo." };
  if (file.size > MAX) return { error: "El archivo supera 10 MB." };
  // El tipo declarado se comprueba contra el contenido real; la extensión sale del tipo, no del nombre
  const type = await verifiedFileType(file, ALLOWED);
  if (!type) return { error: "Formato no permitido (PDF, JPG, PNG, WEBP, HEIC)." };

  const path = `${patientId}/${crypto.randomUUID()}.${type.ext}`;
  const supabase = await createClient();
  const up = await supabase.storage.from("patient-files").upload(path, file, { contentType: type.mime });
  if (up.error) return { error: "No se pudo subir el archivo. Intenta de nuevo." };

  const rawCategory = String(fd.get("category") || "otro");
  const category = CATEGORIES.includes(rawCategory) ? rawCategory : "otro";
  const visible = s.role === "paciente" ? true : fd.get("visible_to_patient") === "on";
  const { error } = await supabase.from("attachments").insert({
    patient_id: patientId, path, name: file.name.slice(0, 200), mime: file.type, size: file.size,
    category, visible_to_patient: visible,
  });
  if (error) {
    await supabase.storage.from("patient-files").remove([path]);
    return { error: /Límite/.test(error.message) ? "Alcanzaste el límite de archivos por hoy. Intenta mañana." : "No se pudo registrar el archivo." };
  }
  revalidatePath(s.role === "paciente" ? "/portal/archivos" : `/consultorio/pacientes/${patientId}/anexos`);
  return { ok: "Archivo subido." };
}

export async function deleteAttachment(id: string) {
  const s = await getSession();
  if (s?.role !== "nutriologo") return;
  const supabase = await createClient();
  const { data } = await supabase.from("attachments").select("path, patient_id").eq("id", id).single();
  if (!data) return;
  await supabase.storage.from("patient-files").remove([data.path]);
  await supabase.from("attachments").delete().eq("id", id);
  revalidatePath(`/consultorio/pacientes/${data.patient_id}/anexos`);
}
