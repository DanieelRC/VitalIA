import { createClient, getSession } from "@/lib/supabase/server";

// Datos de pacientes y del consultorio. Todo pasa por RLS: solo sale lo del consultorio de la sesión.
const PATIENT_TABLES = [
  "consultations", "quick_notes", "anthropometry", "meal_plans", "patient_supplements", "patient_routines", "recalls_24h",
  "progress_logs", "appointments", "messages", "attachments", "daily_logs", "meal_photos", "lab_results", "payments", "meal_checks",
  "arco_requests", "legal_acceptances",
];
const CLINIC_TABLES = [
  "clinic_settings", "availability", "plan_templates", "macro_presets", "meal_presets", "custom_formulas", "custom_factors",
  "custom_fields", "soap_templates", "education_materials", "equivalent_groups", "foods", "recipes", "supplements", "exercises", "routines",
];

/** Portabilidad: exporta todo el consultorio en JSON (también disponible tras cancelar, mientras la cuenta exista). */
export async function GET() {
  const s = await getSession();
  if (!s || s.role !== "nutriologo" || !s.clinicId || s.mfaPending) return new Response("No autorizado", { status: 401 });
  const supabase = await createClient();

  const all = async (table: string, clinicOnly: boolean) => {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      let q = supabase.from(table).select("*").range(from, from + 999);
      if (clinicOnly) q = q.eq("clinic_id", s.clinicId!);
      const { data, error } = await q;
      if (error) return { error: error.message };
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) return rows;
    }
  };

  const out: Record<string, unknown> = {
    generado: new Date().toISOString(),
    consultorio: s.clinicId,
    nota: "Exportación completa del consultorio. Los archivos (fotos, PDF, documentos) se referencian por su ruta y se descargan desde cada expediente.",
    patients: await all("patients", true),
  };
  for (const t of PATIENT_TABLES) out[t] = await all(t, false);
  for (const t of CLINIC_TABLES) out[t] = await all(t, true);
  for (const t of ["pes_diagnoses", "consultation_addenda"]) out[t] = await all(t, false);

  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="vitalia-consultorio-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
