import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Estado del acceso al portal de un expediente:
 * - "none": aún no hay cuenta (se puede invitar).
 * - "pending": la cuenta del propio paciente existe (se creó al invitar), pero aún no crea su contraseña.
 * - "active": el paciente ya creó su contraseña.
 * - "foreign": la cuenta vinculada no es de un paciente o su correo no coincide (no se comparten enlaces).
 * Llamar solo después de verificar que la sesión es del consultorio del paciente (requireRole + RLS).
 */
export async function portalAccess(userId: string | null, email: string): Promise<"none" | "pending" | "active" | "foreign"> {
  if (!userId) return "none";
  const admin = createAdminClient();
  const [{ data: u }, { data: prof }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  const user = u?.user;
  if (!user || prof?.role !== "paciente" || user.email?.toLowerCase() !== email.toLowerCase()) return "foreign";
  // Activa = ya creó su contraseña (setPassword marca app_metadata.password_set). Abrir el enlace no basta: una vista
  // previa automática del enlace puede iniciar sesión sin que la persona haya terminado.
  return user.app_metadata?.password_set ? "active" : "pending";
}
