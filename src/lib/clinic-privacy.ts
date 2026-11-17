import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type ClinicPrivacy = { clinicId: string; name: string; nutritionist: string | null; license: string | null; address: string | null; email: string | null; phone: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Datos del responsable (el consultorio) que deben aparecer en el aviso de privacidad del paciente. Son datos públicos del consultorio. */
export async function clinicPrivacy(clinicId: string | null | undefined): Promise<ClinicPrivacy | null> {
  if (!clinicId || !UUID.test(clinicId)) return null;
  const { data } = await createAdminClient().from("clinic_settings")
    .select("clinic_id, name, nutritionist_name, license, address, email, phone").eq("clinic_id", clinicId).maybeSingle();
  if (!data) return null;
  return { clinicId: data.clinic_id, name: data.name, nutritionist: data.nutritionist_name, license: data.license, address: data.address, email: data.email, phone: data.phone };
}

/** Lo que le falta al consultorio para que su aviso identifique al responsable (art. 15, fr. I). */
export function missingPrivacyFields(c: Pick<ClinicPrivacy, "nutritionist" | "address" | "email">): string[] {
  const miss: string[] = [];
  if (!c.nutritionist) miss.push("nombre del nutriólogo responsable");
  if (!c.address) miss.push("domicilio");
  if (!c.email) miss.push("correo de contacto");
  return miss;
}
