"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient, createClient, requireRole } from "@/lib/supabase/server";
import type { FormState } from "@/components/form";

const list = (v: unknown) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const opt = z.string().trim().max(5000).optional().transform((v) => v || null);

const patientSchema = z.object({
  full_name: z.string().trim().min(2, "Nombre requerido").max(200),
  email: z.email("Correo inválido").transform((v) => v.toLowerCase()),
  phone: opt, birth_date: opt, sex: z.enum(["M", "F"]).nullable().optional(),
  occupation: opt, goal: opt, medications: opt, personal_history: opt, family_history: opt,
  gyneco_history: opt, diet_history: opt,
});

function parsePatient(fd: FormData) {
  const raw = Object.fromEntries(fd);
  const parsed = patientSchema.safeParse({ ...raw, sex: raw.sex || null });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  return {
    data: {
      ...parsed.data,
      pathologies: list(raw.pathologies),
      allergies: list(raw.allergies),
      lifestyle: {
        actividad: String(raw.ls_actividad ?? ""), sueno: String(raw.ls_sueno ?? ""), agua: String(raw.ls_agua ?? ""),
        alcohol: String(raw.ls_alcohol ?? ""), tabaco: String(raw.ls_tabaco ?? ""), estres: String(raw.ls_estres ?? ""),
      },
    },
  } as const;
}

async function invite(email: string, fullName: string) {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/invitacion`,
  });
  return error?.message ?? null;
}

export async function createPatient(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const p = parsePatient(fd);
  if ("error" in p) return { error: p.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("patients").insert(p.data).select("id").single();
  if (error) return { error: error.code === "23505" ? "Ya existe un paciente con ese correo." : error.message };

  if (fd.get("send_invite") === "on") {
    const err = await invite(p.data.email, p.data.full_name);
    if (err && !/already.*registered/i.test(err)) return { error: `Paciente creado, pero la invitación falló: ${err}` };
    await supabase.from("patients").update({ invited_at: new Date().toISOString() }).eq("id", data.id);
  }
  redirect(`/consultorio/pacientes/${data.id}`);
}

export async function updatePatient(id: string, _: FormState, fd: FormData): Promise<FormState> {
  await requireRole("nutriologo");
  const p = parsePatient(fd);
  if ("error" in p) return { error: p.error };
  const supabase = await createClient();
  const { error } = await supabase.from("patients").update(p.data).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/consultorio/pacientes/${id}`);
  return { ok: "Datos guardados." };
}

export async function resendInvite(id: string): Promise<FormState> {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { data: p } = await supabase.from("patients").select("email, full_name, user_id").eq("id", id).single();
  if (!p) return { error: "Paciente no encontrado." };
  if (p.user_id) return { error: "El paciente ya activó su cuenta." };
  const err = await invite(p.email, p.full_name);
  if (err) return { error: err };
  await supabase.from("patients").update({ invited_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/consultorio/pacientes/${id}`);
  return { ok: "Invitación enviada." };
}

export async function setPatientActive(id: string, active: boolean) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from("patients").update({ active }).eq("id", id);
  revalidatePath(`/consultorio/pacientes/${id}`);
}
