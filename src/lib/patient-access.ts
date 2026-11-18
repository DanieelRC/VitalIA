import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Estado del acceso al portal de un expediente:
 * - "none": aún no hay cuenta (se puede invitar).
 * - "pending": la cuenta del propio paciente existe (se creó al invitar), pero nunca ha iniciado sesión.
 * - "active": el paciente ya entró al menos una vez.
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
  return user.last_sign_in_at ? "active" : "pending";
}
