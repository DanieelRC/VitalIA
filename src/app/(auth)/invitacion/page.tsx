import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { Field, Input } from "@/components/ui";
import { getSession } from "@/lib/supabase/server";
import { setPassword } from "../actions";

export const metadata = { title: "Activa tu cuenta" };

export default async function InvitationPage() {
  const s = await getSession();
  if (!s) redirect("/login?error=enlace");
  const needsPrivacy = s.role === "paciente";
  return (
    <div className="grid min-h-screen place-items-center px-4 py-8">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Crea tu contraseña</h1>
        <p className="mt-1 text-sm text-muted">{s.email}</p>
        <ActionForm action={setPassword} className="mt-5 flex flex-col gap-3">
          <Field label="Contraseña" hint="Mínimo 8 caracteres"><Input name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
          <Field label="Confirmar contraseña"><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
          {needsPrivacy && (
            <div className="rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
              <p className="mb-2 font-semibold text-text">Aviso de privacidad</p>
              <p>
                Tus datos personales y de salud (datos sensibles) se usarán exclusivamente para tu atención nutricional:
                integrar tu expediente clínico, elaborar tu plan de alimentación y dar seguimiento a tu evolución, conforme
                a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares y la NOM-004-SSA3-2012.
                No se comparten con terceros salvo obligación legal. El asistente de IA procesa tus mensajes con un proveedor
                externo sin incluir tu nombre. Puedes ejercer tus derechos ARCO solicitándolo a tu nutriólogo.
              </p>
              <label className="mt-3 flex items-start gap-2 text-text">
                <input type="checkbox" name="privacy" required className="mt-0.5" />
                <span>Acepto el aviso de privacidad y otorgo mi consentimiento expreso para el tratamiento de mis datos de salud.</span>
              </label>
            </div>
          )}
          <SubmitButton>Guardar y continuar</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
