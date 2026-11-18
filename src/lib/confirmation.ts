import "server-only";
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/server";

/** Envía el enlace para confirmar el correo de un nutriólogo. En desarrollo sin proveedor de correo, lo escribe en la consola. */
export async function sendConfirmation(email: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) return false;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${site}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent("/consultorio?bienvenida=1")}`;
  const sent = await sendEmail(email, "Confirma tu correo para activar VitalIA",
    `<p>Hola. Para activar tu consultorio en VitalIA, confirma tu correo:</p><p><a href="${link}">Confirmar mi correo</a></p><p>El enlace caduca en 1 hora. Si no creaste una cuenta, ignora este mensaje.</p>`);
  if ("skipped" in sent && process.env.NODE_ENV === "development") console.info("[registro] enlace de confirmación (solo desarrollo):", link);
  return true;
}
