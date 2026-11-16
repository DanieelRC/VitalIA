import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { SoapDraftButton } from "@/components/soap-draft-button";
import { Alert, Badge, Card, Field, fmtDate, fmtDateTime, Input, Select, Textarea } from "@/components/ui";
import { getLatestAnthropometry } from "@/lib/data";
import { evaluationLabels } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";
import { isoToLocal } from "@/lib/time";
import { addAddendum, addPes, deleteDraft, deletePes, saveSoap } from "../actions";

const PES_SUGGESTIONS = [
  "Ingestión energética excesiva", "Ingestión energética inadecuada", "Ingestión excesiva de hidratos de carbono",
  "Ingestión inadecuada de proteína", "Ingestión excesiva de grasa", "Ingestión excesiva de sodio",
  "Ingestión inadecuada de fibra", "Ingestión inadecuada de líquidos", "Sobrepeso/obesidad", "Bajo peso",
  "Pérdida de peso involuntaria", "Valores de laboratorio alterados relacionados con la nutrición",
  "Alteración en la utilización de nutrimentos", "Conocimiento deficiente relacionado con alimentación y nutrición",
  "Elecciones de alimentos indeseables", "Inactividad física", "Patrón de alimentación desordenado",
  "Disposición limitada para el cambio",
];

export default async function ConsultationPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  const supabase = await createClient();
  const [{ data: c }, { data: pes }, { data: addenda }, last] = await Promise.all([
    supabase.from("consultations").select("*").eq("id", cid).eq("patient_id", id).single(),
    supabase.from("pes_diagnoses").select("*").eq("consultation_id", cid).order("created_at"),
    supabase.from("consultation_addenda").select("*").eq("consultation_id", cid).order("created_at"),
    getLatestAnthropometry(id),
  ]);
  if (!c) notFound();
  const signed = c.status === "firmada";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-4">
        <Card title={<>Nota SOAP {signed ? <Badge tone="primary">Firmada {fmtDateTime(c.signed_at)}</Badge> : <Badge tone="warn">Borrador</Badge>}</>}>
          {!signed && <div className="mb-4"><SoapDraftButton patientId={id} consultationId={cid} /></div>}
          <ActionForm action={saveSoap.bind(null, id, cid)} className="grid gap-3">
            <fieldset disabled={signed} className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Fecha y hora"><Input type="datetime-local" name="consulted_at" defaultValue={isoToLocal(c.consulted_at)} required /></Field>
                <Field label="Motivo de consulta"><Input name="reason" defaultValue={c.reason ?? ""} /></Field>
              </div>
              <Field label="S · Subjetivo" hint="Lo que refiere el paciente: síntomas, apetito, adherencia, hábitos, recordatorio, estrés, sueño.">
                <Textarea name="subjective" defaultValue={c.subjective ?? ""} rows={5} />
              </Field>
              <Field label="O · Objetivo" hint="Antropometría, bioquímicos, clínicos, dietéticos medibles.">
                <Textarea name="objective" defaultValue={c.objective ?? ""} rows={5} />
              </Field>
              <Field label="A · Análisis" hint="Interpretación y diagnósticos nutricios (agrega los PES abajo).">
                <Textarea name="assessment" defaultValue={c.assessment ?? ""} rows={4} />
              </Field>
              <Field label="P · Plan" hint="Intervención, metas, educación, monitoreo y próxima cita.">
                <Textarea name="plan" defaultValue={c.plan ?? ""} rows={4} />
              </Field>
            </fieldset>
            {!signed && (
              <div className="flex flex-wrap gap-2">
                <SubmitButton name="intent" value="save">Guardar borrador</SubmitButton>
                <SubmitButton name="intent" value="sign" variant="secondary" pendingText="Firmando…">Guardar y firmar</SubmitButton>
              </div>
            )}
          </ActionForm>
        </Card>

        <Card title="Diagnósticos nutricios (formato PES)">
          {pes?.length ? (
            <ul className="mb-4 flex flex-col gap-2">
              {pes.map((d) => (
                <li key={d.id} className="rounded-lg bg-surface-2 p-3 text-sm">
                  <p><strong>{d.problem}</strong> relacionado con <em>{d.etiology}</em>, evidenciado por {d.signs}.</p>
                  <div className="mt-1 flex items-center justify-between">
                    <Badge>{d.domain === "ingestion" ? "Ingestión" : d.domain === "clinico" ? "Clínico" : "Conductual-ambiental"}</Badge>
                    {!signed && (
                      <form action={async () => { "use server"; await deletePes(id, cid, d.id); }}>
                        <ConfirmButton message="¿Eliminar este diagnóstico?">Eliminar</ConfirmButton>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="mb-3 text-sm text-muted">Sin diagnósticos.</p>}
          {!signed && (
            <ActionForm action={addPes.bind(null, id, cid)} resetOnOk className="grid gap-3 sm:grid-cols-2">
              <Field label="Dominio">
                <Select name="domain"><option value="ingestion">Ingestión</option><option value="clinico">Clínico</option><option value="conductual">Conductual-ambiental</option></Select>
              </Field>
              <Field label="P · Problema"><Input name="problem" list="pes-problems" required /></Field>
              <Field label="E · Etiología (relacionado con…)"><Textarea name="etiology" rows={2} required /></Field>
              <Field label="S · Signos y síntomas (evidenciado por…)"><Textarea name="signs" rows={2} required /></Field>
              <datalist id="pes-problems">{PES_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
              <div><SubmitButton variant="secondary" size="sm">Agregar diagnóstico</SubmitButton></div>
            </ActionForm>
          )}
        </Card>

        {signed && (
          <Card title="Adendas">
            {addenda?.map((a) => (
              <div key={a.id} className="mb-2 rounded-lg bg-surface-2 p-3 text-sm">
                <p className="text-xs text-muted">{fmtDateTime(a.created_at)}</p><p className="whitespace-pre-wrap">{a.body}</p>
              </div>
            ))}
            <ActionForm action={addAddendum.bind(null, id, cid)} resetOnOk className="flex flex-col gap-2">
              <Textarea name="body" rows={3} placeholder="Corrección o información adicional (queda fechada)" />
              <div><SubmitButton variant="secondary" size="sm">Agregar adenda</SubmitButton></div>
            </ActionForm>
          </Card>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <Card title="Última antropometría">
          {last ? (
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
              <dt className="text-muted">Fecha</dt><dd>{fmtDate(last.measured_at)}</dd>
              <dt className="text-muted">Peso</dt><dd>{last.weight_kg ?? "—"} kg</dd>
              <dt className="text-muted">Talla</dt><dd>{last.height_cm ?? "—"} cm</dd>
              {Object.entries(last.results ?? {}).slice(0, 8).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-muted">{evaluationLabels[k] ?? k}</dt><dd>{String(v.value)}</dd></div>
              ))}
            </dl>
          ) : <p className="text-sm text-muted">Sin mediciones.</p>}
        </Card>
        {!signed && (
          <Alert tone="warn">Al firmar, la nota queda inmutable conforme a la NOM-004-SSA3-2012.</Alert>
        )}
        {!signed && (
          <form action={async () => { "use server"; await deleteDraft(id, cid); }}>
            <ConfirmButton message="¿Eliminar este borrador?" variant="ghost">Eliminar borrador</ConfirmButton>
          </form>
        )}
      </aside>
    </div>
  );
}
