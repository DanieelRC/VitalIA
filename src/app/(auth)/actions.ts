"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { sha256 } from "@/lib/security";
import { ageFrom, recordAcceptance } from "@/lib/legal";
import type { FormState } from "@/components/form";
import { sendConfirmation } from "@/lib/confirmation";


export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = z.object({ email: z.email(), password: z.string().min(1) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Correo o contraseña inválidos." };

  // Freno a fuerza bruta por cuenta: máx. 8 intentos fallidos en 15 minutos
  const admin = createAdminClient();
  const emailHash = sha256(parsed.data.email.toLowerCase());
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count } = await admin.from("login_attempts").select("id", { count: "exact", head: true }).eq("email_hash", emailHash).gte("created_at", since);
  if ((count ?? 0) >= 8) return { error: "Demasiados intentos. Espera 15 minutos o restablece tu contraseña." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    await admin.from("login_attempts").insert({ email_hash: emailHash });
    await admin.from("login_attempts").delete().lt("created_at", new Date(Date.now() - 864e5).toISOString());
    if (error.code === "email_not_confirmed") {
      await sendConfirmation(parsed.data.email);
      return { error: "Aún no confirmas tu correo. Te enviamos un nuevo enlace de confirmación." };
    }
    return { error: "Credenciales incorrectas." };
  }
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login/verificar");
  redirect("/");
}

/** Alta de un nutriólogo con su consultorio en periodo de prueba (plan Inicio). */
export async function signUp(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = z.object({
    full_name: z.string().trim().min(3, "Escribe tu nombre completo").max(120),
    clinic: z.string().trim().min(2, "Escribe el nombre de tu consultorio").max(120),
    email: z.email("Escribe un correo válido"),
    password: z.string().min(8, "La contraseña necesita al menos 8 caracteres").max(72),
    license: z.string().trim().max(20).regex(/^[0-9A-Za-z-]*$/, "La cédula solo lleva números y letras").optional(),
    terms: z.literal("on", "Debes aceptar el aviso de privacidad y los términos"),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  // Freno a altas masivas: máx. 5 por correo/IP en una hora (reusa la bitácora de intentos)
  const admin = createAdminClient();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = sha256(`registro:${ip}`);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("login_attempts").select("id", { count: "exact", head: true }).eq("email_hash", key).gte("created_at", since);
  if ((count ?? 0) >= 5) return { error: "Demasiados registros desde esta red. Intenta más tarde." };
  await admin.from("login_attempts").insert({ email_hash: key });

  // La cuenta queda sin confirmar hasta que la persona abre el enlace que llega a su correo
  const { data: created, error } = await admin.auth.admin.createUser({
    email: d.email, password: d.password, email_confirm: false, user_metadata: { full_name: d.full_name },
  });
  if (error || !created.user) {
    const taken = /already|registered|exists/i.test(error?.message ?? "");
    return { error: taken ? "Ya existe una cuenta con ese correo. Inicia sesión o restablece tu contraseña." : "No se pudo crear la cuenta. Revisa la contraseña e intenta de nuevo." };
  }
  const { data: ps } = await admin.from("platform_settings").select("default_trial_days").maybeSingle();
  const { data: clinicId, error: ce } = await admin.rpc("create_clinic", {
    p_owner: created.user.id, p_name: d.clinic, p_owner_name: d.full_name, p_trial_days: ps?.default_trial_days ?? 14,
  });
  if (ce) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: "No se pudo crear el consultorio. Intenta de nuevo." };
  }
  if (d.license) await admin.from("clinic_settings").update({ license: d.license }).eq("clinic_id", clinicId);
  // Evidencia de aceptación (fecha, versión, IP y navegador)
  await recordAcceptance({ userId: created.user.id, document: "aviso_vitalia", clinicId });
  await recordAcceptance({ userId: created.user.id, document: "terminos", clinicId });
  await sendConfirmation(d.email);
  redirect(`/registro/confirma?correo=${encodeURIComponent(d.email)}`);
}

export async function requestReset(_: FormState, fd: FormData): Promise<FormState> {
  const email = z.email().safeParse(fd.get("email"));
  if (!email.success) return { error: "Escribe un correo válido." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/invitacion`,
  });
  // Misma respuesta exista o no la cuenta (evita enumeración de usuarios)
  return { ok: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña." };
}

export async function setPassword(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = z
    .object({ password: z.string().min(8, "Mínimo 8 caracteres"), confirm: z.string(), privacy: z.literal("on").optional(), tutor_name: z.string().trim().max(160).optional() })
    .refine((d) => d.password === d.confirm, "Las contraseñas no coinciden")
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "El enlace expiró. Pide a tu nutriólogo una nueva invitación." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role === "paciente") {
    const { data: patient } = await supabase.from("my_patient").select("id, birth_date, privacy_accepted_at").single();
    if (patient && !patient.privacy_accepted_at) {
      if (!parsed.data.privacy) return { error: "Debes aceptar el aviso de privacidad." };
      const minor = (ageFrom(patient.birth_date) ?? 99) < 18;
      if (minor && (parsed.data.tutor_name ?? "").length < 5) return { error: "Escribe el nombre completo de tu madre, padre o tutor." };
      await recordAcceptance({ userId: user.id, document: "aviso_paciente", patientId: patient.id, tutorName: minor ? parsed.data.tutor_name : null });
      await supabase.rpc("accept_privacy");
    }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "No se pudo guardar la contraseña. Usa al menos 8 caracteres con letras y números, o pide un enlace nuevo." };
  // Marca de activación real (app_metadata solo la escribe el servidor): abrir el enlace no basta, hay que crear la contraseña
  await createAdminClient().auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, password_set: true } });
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
