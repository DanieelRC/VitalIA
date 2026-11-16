"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { verifiedFileType } from "@/lib/security";
import { createClient, requireRole } from "@/lib/supabase/server";

const IMAGES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX = 10 * 1024 * 1024;

/** El paciente sube la foto de un plato. La ruta queda dentro de su carpeta y RLS lo exige también. */
export async function uploadMealPhoto(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("paciente");
  const d = z.object({ meal: z.string().trim().min(1).max(60), note: z.string().trim().max(500).optional() }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: "Elige el tiempo de comida." };
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Toma o elige una foto." };
  if (file.size > MAX) return { error: "La foto supera 10 MB." };
  const type = await verifiedFileType(file, IMAGES);
  if (!type) return { error: "Formato no permitido. Usa JPG, PNG, WEBP o HEIC." };

  const path = `${s.patientId}/comidas/${crypto.randomUUID()}.${type.ext}`;
  const supabase = await createClient();
  const up = await supabase.storage.from("patient-files").upload(path, file, { contentType: type.mime });
  if (up.error) return { error: "No se pudo subir la foto. Intenta de nuevo." };
  const { error } = await supabase.from("meal_photos").insert({ patient_id: s.patientId, path, meal: d.data.meal, note: d.data.note || null });
  if (error) {
    return { error: /Límite/.test(error.message) ? "Ya subiste muchas fotos hoy. Mañana puedes seguir." : "No se pudo guardar la foto." };
  }
  revalidatePath("/portal/comidas");
  return { ok: "Foto guardada. Tu nutriólogo podrá comentarla." };
}

export async function deleteMealPhoto(id: string) {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const { data } = await supabase.from("meal_photos").select("path").eq("id", id).eq("patient_id", s.patientId!).maybeSingle();
  if (!data) return;
  await supabase.storage.from("patient-files").remove([data.path]);
  await supabase.from("meal_photos").delete().eq("id", id);
  revalidatePath("/portal/comidas");
}

/** Comentario del nutriólogo sobre una foto (visible para el paciente). */
export async function commentMealPhoto(patientId: string, id: string, _: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const comment = z.string().trim().max(1000).safeParse(fd.get("comment"));
  if (!comment.success) return { error: "El comentario es demasiado largo." };
  const supabase = await createClient();
  const { error } = await supabase.from("meal_photos")
    .update({ comment: comment.data || null, commented_at: comment.data ? new Date().toISOString() : null }).eq("id", id).eq("patient_id", patientId);
  if (error) return { error: "No se pudo guardar el comentario." };
  revalidatePath(`/consultorio/pacientes/${patientId}/comidas`);
  return { ok: "Comentario guardado." };
}
