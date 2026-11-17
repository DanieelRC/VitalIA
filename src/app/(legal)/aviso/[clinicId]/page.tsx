import { notFound } from "next/navigation";
import { LegalDoc } from "@/components/legal-doc";
import { PatientNoticeFull } from "@/components/patient-privacy-notice";
import { clinicPrivacy, missingPrivacyFields } from "@/lib/clinic-privacy";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Aviso de privacidad para pacientes", robots: { index: false } };

export default async function ClinicNotice({ params, searchParams }: { params: Promise<{ clinicId: string }>; searchParams: Promise<{ firma?: string }> }) {
  const [{ clinicId }, { firma }] = await Promise.all([params, searchParams]);
  const c = await clinicPrivacy(clinicId);
  if (!c) notFound();
  return (
    <LegalDoc title="Aviso de privacidad integral" subtitle={`Para pacientes de ${c.name}`} updated={LEGAL.updated} draft={LEGAL.draft || missingPrivacyFields(c).length > 0}>
      <PatientNoticeFull c={c} />
      {firma && (
        <section className="mt-10 border-t border-border pt-6 text-sm">
          <h2>Consentimiento</h2>
          <p>
            He leído este aviso de privacidad y otorgo mi consentimiento expreso para el tratamiento de mis datos personales, incluidos mis datos
            sensibles de salud, para las finalidades descritas.
          </p>
          <div className="mt-10 grid gap-10 sm:grid-cols-2">
            {["Nombre y firma del paciente", "Fecha"].map((l) => <p key={l} className="border-t border-text pt-1">{l}</p>)}
            {["Si es menor de edad: nombre y firma de madre, padre o tutor", "Parentesco"].map((l) => <p key={l} className="border-t border-text pt-1">{l}</p>)}
          </div>
        </section>
      )}
    </LegalDoc>
  );
}
