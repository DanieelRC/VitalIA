import Link from "next/link";
import { FileText, Printer } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/form";
import { Alert, Badge, Card, cn, Empty, Field, fmtDate, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { clinicPrivacy, missingPrivacyFields } from "@/lib/clinic-privacy";
import { ARCO_LABEL, ARCO_STATUS, LEGAL } from "@/lib/legal";
import { createClient, requireRole } from "@/lib/supabase/server";
import { recordPaperConsent, respondArco } from "./actions";

export const metadata = { title: "Privacidad y ARCO" };

export default async function PrivacyAdmin() {
  const s = await requireRole("nutriologo");
  const supabase = await createClient();
  const [clinic, { data: requests }, { data: patients }, { data: consents }] = await Promise.all([
    clinicPrivacy(s.clinicId),
    supabase.from("arco_requests").select("id, kind, details, status, response, created_at, due_at, responded_at, patients(full_name)").order("created_at", { ascending: false }).limit(100),
    supabase.from("patients").select("id, full_name, birth_date, user_id").eq("active", true).order("full_name"),
    supabase.from("legal_acceptances").select("patient_id, version, method, accepted_at").eq("document", "aviso_paciente").order("accepted_at", { ascending: false }),
  ]);
  const missing = clinic ? missingPrivacyFields(clinic) : ["datos del consultorio"];
  const latest = new Map<string, { version: string; method: string; accepted_at: string }>();
  for (const c of consents ?? []) if (c.patient_id && !latest.has(c.patient_id)) latest.set(c.patient_id, c);
  const pendingConsent = (patients ?? []).filter((p) => latest.get(p.id)?.version !== LEGAL.versions.aviso_paciente);
  const open = (requests ?? []).filter((r) => r.status === "recibida" || r.status === "en_proceso");
  const now = Date.now();

  return (
    <>
      <PageHeader title="Privacidad y ARCO" subtitle="Eres responsable de los datos de tus pacientes. Aquí tienes tu aviso de privacidad, los consentimientos y las solicitudes de derechos ARCO." />
      <div className="flex flex-col gap-4">
        {missing.length > 0 && (
          <Alert tone="warn">
            Tu aviso de privacidad debe identificar al responsable. Falta: {missing.join(", ")}.{" "}
            <Link href="/consultorio/ajustes" className="font-semibold underline">Complétalo en Ajustes</Link>.
          </Alert>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Tu aviso de privacidad">
            <p className="text-sm text-muted">Se genera con los datos de tu consultorio. Tus pacientes lo aceptan al activar su portal.</p>
            <div className="mt-3 flex flex-col gap-2 text-sm font-semibold">
              <Link href={`/aviso/${s.clinicId}`} target="_blank" className="inline-flex items-center gap-1.5 text-primary hover:underline"><FileText className="size-4" /> Ver aviso integral</Link>
              <Link href={`/aviso/${s.clinicId}?firma=1`} target="_blank" className="inline-flex items-center gap-1.5 text-primary hover:underline"><Printer className="size-4" /> Versión para firmar en papel</Link>
            </div>
          </Card>
          <Card title="Solicitudes abiertas">
            <p className="font-display text-4xl font-bold tabular-nums">{open.length}</p>
            <p className="text-sm text-muted">{open.some((r) => Date.parse(r.due_at) < now) ? "Hay solicitudes vencidas: respóndelas cuanto antes." : "Plazo legal: 20 días hábiles para responder."}</p>
          </Card>
          <Card title="Sin consentimiento vigente">
            <p className="font-display text-4xl font-bold tabular-nums">{pendingConsent.length}</p>
            <p className="text-sm text-muted">Pacientes activos sin aceptación de la versión actual del aviso.</p>
          </Card>
        </div>

        <Card title="Solicitudes de derechos ARCO">
          {!requests?.length ? <Empty>No hay solicitudes. Tus pacientes pueden hacerlas desde «Mis datos» en su portal.</Empty> : (
            <ul className="flex flex-col gap-3">
              {requests.map((r) => {
                const st = ARCO_STATUS[r.status];
                const late = (r.status === "recibida" || r.status === "en_proceso") && Date.parse(r.due_at) < now;
                const name = (r.patients as unknown as { full_name: string } | null)?.full_name ?? "Paciente";
                return (
                  <li key={r.id} className={cn("rounded-xl border p-3 text-sm", late ? "border-danger/50" : "border-border")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="font-semibold">{name}</span> · {ARCO_LABEL[r.kind]}</span>
                      <span className="flex items-center gap-2">
                        {late && <Badge tone="danger">Vencida</Badge>}
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </span>
                    </div>
                    <p className="mt-1">{r.details}</p>
                    <p className="mt-1 text-xs text-muted">Recibida el {fmtDate(r.created_at)} · responder a más tardar el {fmtDate(r.due_at)}{r.responded_at ? ` · última respuesta ${fmtDate(r.responded_at)}` : ""}</p>
                    <details className="mt-2" open={r.status === "recibida"}>
                      <summary className="cursor-pointer text-xs font-semibold text-primary">Responder</summary>
                      <ActionForm action={respondArco.bind(null, r.id)} className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-end">
                        <Field label="Estado">
                          <Select name="status" defaultValue={r.status === "recibida" ? "en_proceso" : r.status}>
                            <option value="en_proceso">En proceso</option>
                            <option value="procedente">Atendida</option>
                            <option value="improcedente">No procedente</option>
                          </Select>
                        </Field>
                        <Field label="Respuesta para la persona"><Textarea name="response" defaultValue={r.response ?? ""} maxLength={4000} className="min-h-16" /></Field>
                        <SubmitButton size="sm">Guardar</SubmitButton>
                      </ActionForm>
                      {r.kind === "cancelacion" && <p className="mt-2 text-xs text-muted">El expediente clínico debe conservarse {LEGAL.retentionYears} años desde la última consulta (NOM-004). Puedes marcar al paciente como inactivo y responder que sus datos quedan bloqueados hasta cumplir el plazo.</p>}
                      {r.kind === "acceso" && <p className="mt-2 text-xs text-muted">Entrega la información por un medio seguro (por ejemplo, el PDF del expediente en consulta o en «Archivos» del paciente).</p>}
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Consentimientos pendientes">
          {!pendingConsent.length ? <Empty>Todos tus pacientes activos aceptaron la versión vigente del aviso.</Empty> : (
            <ul className="divide-y divide-border">
              {pendingConsent.map((p) => {
                const prev = latest.get(p.id);
                return (
                  <li key={p.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Link href={`/consultorio/pacientes/${p.id}`} className="font-semibold hover:underline">{p.full_name}</Link>
                      <p className="text-xs text-muted">
                        {prev ? `Aceptó una versión anterior (${fmtDate(prev.accepted_at)})` : p.user_id ? "Aún no acepta el aviso en su portal" : "Sin portal: recaba su firma en consulta"}
                      </p>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold text-primary">Registrar firma en papel</summary>
                      <ActionForm action={recordPaperConsent.bind(null, p.id)} className="mt-2 flex flex-col gap-2">
                        <Field label="Fecha de firma"><Input type="date" name="date" required max={new Date().toISOString().slice(0, 10)} /></Field>
                        <Field label="Madre, padre o tutor (si es menor)"><Input name="tutor_name" maxLength={160} /></Field>
                        <label className="flex items-start gap-2 text-xs"><input type="checkbox" name="confirm" required className="mt-0.5" /> Tengo el aviso firmado y lo conservo con el expediente.</label>
                        <SubmitButton size="sm">Registrar</SubmitButton>
                      </ActionForm>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
