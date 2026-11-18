"use server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/security";

const TYPES: EmailOtpType[] = ["invite", "recovery", "email", "magiclink"];

/**
 * Canjea el enlace de un solo uso. Solo ocurre al pulsar «Continuar» (POST): las vistas previas de enlaces de los
 * clientes de correo y de mensajería (que hacen GET/HEAD) ya no gastan el token antes que la persona.
 */
export async function confirmLink(fd: FormData) {
  const tokenHash = String(fd.get("token_hash") ?? "");
  const type = String(fd.get("type") ?? "") as EmailOtpType;
  if (!tokenHash || !TYPES.includes(type)) redirect("/login?error=enlace");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) redirect("/login?error=enlace");

  // Solo rutas internas (el origen es indiferente: se usa la ruta resultante)
  const target = safeNext(String(fd.get("next") ?? "/"), "https://vitalia.invalid");
  redirect(target.origin === "https://vitalia.invalid" ? `${target.pathname}${target.search}` : "/");
}
