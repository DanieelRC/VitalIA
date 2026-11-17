import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { PatientNoticeShort } from "@/components/patient-privacy-notice";
import { Field, Input } from "@/components/ui";
import { clinicPrivacy } from "@/lib/clinic-privacy";
import { ageFrom } from "@/lib/legal";
import { createClient, getSession } from "@/lib/supabase/server";
import { setPassword } from "../actions";

export const metadata = { title: "Activa tu cuenta" };

export default async function InvitationPage() {
  const s = await getSession();
  if (!s) redirect("/login?error=enlace");
  let needsPrivacy = false, minor = false;
  let clinic = null;
  if (s.role === "paciente") {
    const supabase = await createClient();
    const { data: me } = await supabase.from("my_patient").select("birth_date, privacy_accepted_at").single();
    needsPrivacy = !me?.privacy_accepted_at;
    minor = (ageFrom(me?.birth_date) ?? 99) < 18;
    clinic = (await clinicPrivacy(s.clinicId)) ?? { clinicId: s.clinicId ?? "", name: "", nutritionist: null, license: null, address: null, email: null, phone: null };
  }
  return (
    <div className="grid min-h-screen place-items-center px-4 py-8">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Crea tu contraseña</h1>
        <p className="mt-1 text-sm text-muted">{s.email}</p>
        <ActionForm action={setPassword} className="mt-5 flex flex-col gap-3">
          <Field label="Contraseña" hint="Mínimo 8 caracteres"><Input name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
          <Field label="Confirmar contraseña"><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
          {needsPrivacy && clinic && (
            <div className="rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
              <p className="mb-2 font-semibold text-text">Aviso de privacidad</p>
              <PatientNoticeShort c={clinic} />
              {minor && (
                <div className="mt-3 flex flex-col gap-2 rounded-lg border border-warn/40 bg-warn-soft p-3 text-text">
                  <p className="font-semibold text-warn">Eres menor de edad</p>
                  <p>Tu madre, padre o tutor debe leer este aviso y dar el consentimiento.</p>
                  <Field label="Nombre completo de tu madre, padre o tutor"><Input name="tutor_name" required minLength={5} autoComplete="off" /></Field>
                </div>
              )}
              <label className="mt-3 flex items-start gap-2 text-text">
                <input type="checkbox" name="privacy" required className="mt-0.5" />
                <span>
                  {minor
                    ? "Como madre, padre o tutor, acepto el aviso de privacidad y otorgo mi consentimiento expreso para el tratamiento de los datos de salud de la persona menor."
                    : "Acepto el aviso de privacidad y otorgo mi consentimiento expreso para el tratamiento de mis datos de salud."}
                </span>
              </label>
            </div>
          )}
          <SubmitButton>Guardar y continuar</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
