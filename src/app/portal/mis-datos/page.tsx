import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/form";
import { Badge, Card, Empty, Field, fmtDate, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ARCO_LABEL, ARCO_STATUS, LEGAL, ageFrom } from "@/lib/legal";
import { createClient, requireRole } from "@/lib/supabase/server";
import { acceptNotice, requestArco } from "./actions";

export const metadata = { title: "Mis datos y privacidad" };

const KIND_HELP: Record<string, string> = {
  acceso: "Recibir una copia de los datos que tiene tu nutriólogo sobre ti.",
  rectificacion: "Corregir un dato que está mal o incompleto.",
  cancelacion: "Que se eliminen tus datos (el expediente se conserva bloqueado el tiempo que exige la ley).",
  oposicion: "Que se deje de usar tu información para algún fin.",
  revocacion: "Retirar tu consentimiento para el tratamiento de tus datos.",
};

export default async function MyData() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const [{ data: me }, { data: consents }, { data: requests }] = await Promise.all([
    supabase.from("my_patient").select("birth_date, privacy_accepted_at").single(),
    supabase.from("legal_acceptances").select("version, method, tutor_name, accepted_at").eq("patient_id", s.patientId!).eq("document", "aviso_paciente").order("accepted_at", { ascending: false }).limit(1),
    supabase.from("arco_requests").select("id, kind, details, status, response, created_at, due_at, responded_at").eq("patient_id", s.patientId!).order("created_at", { ascending: false }),
  ]);
  const last = consents?.[0];
  const current = last?.version === LEGAL.versions.aviso_paciente;
  const minor = (ageFrom(me?.birth_date) ?? 99) < 18;

  return (
    <>
      <PageHeader title="Mis datos y privacidad" subtitle="Consulta cómo se usan tus datos, descárgalos o solicita a tu nutriólogo que los corrija o elimine." />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <Card title="Aviso de privacidad">
            {current ? (
              <p className="text-sm">
                Aceptaste la versión vigente el {fmtDate(last!.accepted_at)}{last!.method === "papel" ? " (firmada en consulta)" : ""}
                {last!.tutor_name ? `, con el consentimiento de ${last!.tutor_name}` : ""}.
              </p>
            ) : (
              <ActionForm action={acceptNotice} className="flex flex-col gap-3 text-sm">
                <p>{last ? "El aviso de privacidad cambió. Revísalo y acepta la nueva versión." : "Revisa el aviso de privacidad de tu consultorio y acéptalo."}</p>
                {minor && <Field label="Nombre completo de tu madre, padre o tutor"><Input name="tutor_name" required minLength={5} /></Field>}
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="privacy" required className="mt-0.5" />
                  <span>{minor ? "Como madre, padre o tutor, acepto el aviso y otorgo el consentimiento expreso para el tratamiento de los datos de salud." : "Acepto el aviso de privacidad y otorgo mi consentimiento expreso para el tratamiento de mis datos de salud."}</span>
                </label>
                <SubmitButton size="sm">Aceptar</SubmitButton>
              </ActionForm>
            )}
            {s.clinicId && (
              <Link href={`/aviso/${s.clinicId}`} target="_blank" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                <FileText className="size-4" /> Leer el aviso de privacidad completo
              </Link>
            )}
          </Card>

          <Card title="Descarga tus datos">
            <p className="text-sm text-muted">Un archivo con la información que ves en tu portal: datos generales, mediciones, progreso, registros, plan, citas y mensajes.</p>
            <a href="/api/mis-datos" download className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-primary-soft/50">
              <Download className="size-4" /> Descargar mis datos
            </a>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Solicitar a tu nutriólogo">
            <ActionForm action={requestArco} resetOnOk className="flex flex-col gap-3">
              <Field label="¿Qué quieres solicitar?">
                <Select name="kind" required defaultValue="">
                  <option value="" disabled>Elige una opción</option>
                  {Object.entries(ARCO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}: {KIND_HELP[k]}</option>)}
                </Select>
              </Field>
              <Field label="Detalle" hint="Qué datos y qué necesitas. Ejemplo: «Mi fecha de nacimiento está mal, es el 3 de mayo de 1990»."><Textarea name="details" required minLength={10} maxLength={2000} /></Field>
              <SubmitButton pendingText="Enviando…">Enviar solicitud</SubmitButton>
            </ActionForm>
            <p className="mt-3 text-xs text-muted">Tu nutriólogo debe responderte en un máximo de 20 días hábiles. El trámite es gratuito.</p>
          </Card>

          <Card title="Mis solicitudes">
            {!requests?.length ? <Empty>Aún no has hecho solicitudes.</Empty> : (
              <ul className="flex flex-col gap-3">
                {requests.map((r) => {
                  const st = ARCO_STATUS[r.status];
                  return (
                    <li key={r.id} className="rounded-xl border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{ARCO_LABEL[r.kind]}</span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      <p className="mt-1 text-muted">{r.details}</p>
                      <p className="mt-1 text-xs text-muted">Enviada el {fmtDate(r.created_at)} · respuesta a más tardar el {fmtDate(r.due_at)}</p>
                      {r.response && <p className="mt-2 rounded-lg bg-surface-2 p-2.5"><span className="font-semibold">Respuesta:</span> {r.response}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
