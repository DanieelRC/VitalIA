"use server";
import { planError } from "@/lib/plan";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient, createClient, requireRole } from "@/lib/supabase/server";
import { portalAccess } from "@/lib/patient-access";
import type { FormState } from "@/components/form";

const list = (v: unknown) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const opt = z.string().trim().max(5000).optional().transform((v) => v || null);

const patientSchema = z.object({
  full_name: z.string().trim().min(2, "Nombre requerido").max(200),
  email: z.email("Correo inválido").transform((v) => v.toLowerCase()),
  phone: opt, birth_date: opt, sex: z.enum(["M", "F"]).nullable().optional(),
  occupation: opt, goal: opt, medications: opt, personal_history: opt, family_history: opt,
  gyneco_history: opt, diet_history: opt,
  target_weight_kg: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(2).max(500).nullable()),
});

function parsePatient(fd: FormData) {
  const raw = Object.fromEntries(fd);
  const parsed = patientSchema.safeParse({ ...raw, sex: raw.sex || null });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  // Campos propios del consultorio (cf_<clave>)
  const custom: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.startsWith("cf_") ? k.slice(3) : "";
    if (/^[a-z][a-z0-9_]{1,40}$/.test(key) && Object.keys(custom).length < 60) custom[key] = String(v).trim().slice(0, 500);
  }
  return {
    data: {
      ...parsed.data,
      custom,
      pathologies: list(raw.pathologies),
      allergies: list(raw.allergies),
      lifestyle: {
        actividad: String(raw.ls_actividad ?? ""), sueno: String(raw.ls_sueno ?? ""), agua: String(raw.ls_agua ?? ""),
        alcohol: String(raw.ls_alcohol ?? ""), tabaco: String(raw.ls_tabaco ?? ""), estres: String(raw.ls_estres ?? ""),
      },
    },
  } as const;
}

const ACCESS_ERROR = {
  active: "El paciente ya activó su cuenta. Si olvidó su contraseña, puede restablecerla desde «¿Olvidaste tu contraseña?» al iniciar sesión.",
  foreign: "Ese correo ya pertenece a otra cuenta de VitalIA. Verifica el correo del paciente.",
} as const;

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
  if (error) return { error: planError(error.message) ?? (error.code === "23505" ? "Ya existe un paciente con ese correo." : error.message) };

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
  // Se conservan los valores de campos que ya no existen en el formulario
  const { data: prev } = await supabase.from("patients").select("custom").eq("id", id).single();
  const { error } = await supabase.from("patients").update({ ...p.data, custom: { ...(prev?.custom ?? {}), ...p.data.custom } }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/consultorio/pacientes/${id}`);
  return { ok: "Datos guardados." };
}

export async function resendInvite(id: string): Promise<FormState> {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { data: p } = await supabase.from("patients").select("email, full_name, user_id").eq("id", id).single();
  if (!p) return { error: "Paciente no encontrado." };
  const access = await portalAccess(p.user_id, p.email);
  if (access === "active" || access === "foreign") return { error: ACCESS_ERROR[access] };
  if (access === "pending") {
    // La cuenta ya existe (se creó con la invitación anterior): se manda al correo del paciente un enlace para crear su contraseña
    const { error } = await supabase.auth.resetPasswordForEmail(p.email, { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/invitacion` });
    if (error) return { error: "No se pudo enviar la invitación. Intenta de nuevo en unos minutos." };
  } else {
    const err = await invite(p.email, p.full_name);
    if (err) return { error: /already.*registered/i.test(err) ? ACCESS_ERROR.foreign : err };
  }
  await supabase.from("patients").update({ invited_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/consultorio/pacientes/${id}`);
  return { ok: "Invitación enviada." };
}

/**
 * Genera un enlace de invitación para compartirlo por WhatsApp u otro medio (sin depender del correo de Supabase,
 * que en el plan gratis solo entrega a miembros del equipo). El enlace es de un solo uso y expira.
 */
export async function createInviteLink(id: string): Promise<{ link?: string; error?: string }> {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { data: p } = await supabase.from("patients").select("email, full_name, user_id").eq("id", id).single();
  if (!p) return { error: "Paciente no encontrado." };
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) return { error: "Falta NEXT_PUBLIC_SITE_URL en el servidor." };

  const admin = createAdminClient();
  const redirectTo = `${site}/invitacion`;
  // Sin cuenta → invitación. Cuenta del propio paciente que nunca ha entrado → recuperación (para crear su contraseña).
  // Nunca un enlace para otra cuenta o una ya activa: iniciaría sesión como esa persona.
  const access = await portalAccess(p.user_id, p.email);
  if (access === "active" || access === "foreign") return { error: ACCESS_ERROR[access] };
  const type: "invite" | "recovery" = access === "pending" ? "recovery" : "invite";
  const res = type === "invite"
    ? await admin.auth.admin.generateLink({ type: "invite", email: p.email, options: { data: { full_name: p.full_name }, redirectTo } })
    : await admin.auth.admin.generateLink({ type: "recovery", email: p.email, options: { redirectTo } });
  // La invitación falla si el correo ya tiene una cuenta que no es de este expediente
  if (res.error && type === "invite") return { error: /already|registered|exists/i.test(res.error.message) ? ACCESS_ERROR.foreign : "No se pudo generar el enlace." };
  const hash = res.data?.properties?.hashed_token;
  if (res.error || !hash) return { error: "No se pudo generar el enlace." };
  await supabase.from("patients").update({ invited_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/consultorio/pacientes/${id}`);
  return { link: `${site}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=${type}&next=${encodeURIComponent("/invitacion")}` };
}

export async function setPatientActive(id: string, active: boolean) {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { error } = await supabase.from("patients").update({ active }).eq("id", id);
  if (error && planError(error.message)) redirect("/consultorio/suscripcion?aviso=limite");
  revalidatePath(`/consultorio/pacientes/${id}`);
}
