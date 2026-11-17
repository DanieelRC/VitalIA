import { createClient, getSession } from "@/lib/supabase/server";

/** Derecho de acceso (autoservicio): descarga en JSON de lo que el paciente ve en su portal. Las notas clínicas no se incluyen. */
export async function GET() {
  const s = await getSession();
  if (!s || s.role !== "paciente" || !s.patientId) return new Response("No autorizado", { status: 401 });
  const supabase = await createClient();
  const pid = s.patientId;
  const tables = {
    datos_generales: supabase.from("my_patient").select("*").maybeSingle(),
    mediciones: supabase.from("my_anthropometry").select("*").eq("patient_id", pid).order("measured_at"),
    progreso: supabase.from("progress_logs").select("*").eq("patient_id", pid).order("logged_at"),
    registro_diario: supabase.from("daily_logs").select("*").eq("patient_id", pid).order("day"),
    comidas_marcadas: supabase.from("meal_checks").select("*").eq("patient_id", pid).order("day"),
    recordatorios_24h: supabase.from("my_recalls").select("*").eq("patient_id", pid),
    planes: supabase.from("meal_plans").select("*").eq("patient_id", pid),
    citas: supabase.from("appointments").select("starts_at, ends_at, status, reason").eq("patient_id", pid).order("starts_at"),
    mensajes: supabase.from("messages").select("body, created_at, sender_id").eq("patient_id", pid).order("created_at"),
    fotos_de_comidas: supabase.from("meal_photos").select("meal, path, comment, created_at").eq("patient_id", pid),
    solicitudes_arco: supabase.from("arco_requests").select("kind, details, status, response, created_at, responded_at").eq("patient_id", pid),
    consentimientos: supabase.from("legal_acceptances").select("document, version, method, tutor_name, accepted_at").eq("patient_id", pid),
  };
  const entries = await Promise.all(Object.entries(tables).map(async ([k, q]) => {
    const { data, error } = await q;
    return [k, error ? null : data] as const;
  }));
  const body = JSON.stringify({
    generado: new Date().toISOString(),
    nota: "Datos que puedes ver en tu portal. Para solicitar una copia de tu expediente clínico completo, usa «Solicitar acceso» en Mis datos.",
    ...Object.fromEntries(entries),
  }, null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="mis-datos-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
