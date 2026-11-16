"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { sha256 } from "@/lib/security";
import type { FormState } from "@/components/form";

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
    return { error: "Credenciales incorrectas." };
  }
  redirect("/");
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
    .object({ password: z.string().min(8, "Mínimo 8 caracteres"), confirm: z.string(), privacy: z.literal("on").optional() })
    .refine((d) => d.password === d.confirm, "Las contraseñas no coinciden")
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "El enlace expiró. Pide a tu nutriólogo una nueva invitación." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role === "paciente") {
    const { data: patient } = await supabase.from("my_patient").select("privacy_accepted_at").single();
    if (!patient?.privacy_accepted_at && !parsed.data.privacy) return { error: "Debes aceptar el aviso de privacidad." };
    if (!patient?.privacy_accepted_at) await supabase.rpc("accept_privacy");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "No se pudo guardar la contraseña. Usa al menos 8 caracteres con letras y números, o pide un enlace nuevo." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
