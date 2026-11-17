import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";

/** Pide al paciente aceptar el aviso vigente cuando no hay evidencia de la versión actual. */
export async function ConsentBanner({ patientId }: { patientId: string | null }) {
  if (!patientId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("legal_acceptances").select("version").eq("patient_id", patientId)
    .eq("document", "aviso_paciente").order("accepted_at", { ascending: false }).limit(1).maybeSingle();
  if (data?.version === LEGAL.versions.aviso_paciente) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-info-soft px-3.5 py-2.5 text-sm text-info">
      <span>{data ? "Actualizamos el aviso de privacidad de tu consultorio." : "Confirma el aviso de privacidad de tu consultorio."}</span>
      <Link href="/portal/mis-datos" className="font-semibold hover:underline">Revisar</Link>
    </div>
  );
}
