import { ActionForm, SubmitButton } from "@/components/form";
import { Alert, Button, Card, fmtDate, fmtDateTime, LinkButton } from "@/components/ui";
import { getCustomFields, getLatestAnthropometry, getPatient } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { InviteLink } from "@/components/invite-link";
import { resendInvite, setPatientActive, updatePatient } from "../actions";
import { PatientFields } from "../patient-fields";

export default async function PatientSummary({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPatient(id);
  const supabase = await createClient();
  const [customFields, last, plan, nextAppt] = await Promise.all([
    getCustomFields(),
    getLatestAnthropometry(id),
    supabase.from("meal_plans").select("id, name, kcal_target").eq("patient_id", id).eq("status", "activo").maybeSingle(),
    supabase.from("appointments").select("starts_at, status").eq("patient_id", id).gte("starts_at", new Date().toISOString())
      .neq("status", "cancelada").order("starts_at").limit(1).maybeSingle(),
  ]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card title="Historia clínico-nutricional">
        <ActionForm action={updatePatient.bind(null, id)}>
          <PatientFields p={p} customFields={customFields} />
          <div className="mt-4"><SubmitButton>Guardar</SubmitButton></div>
        </ActionForm>
      </Card>
      <div className="flex flex-col gap-4">
        <Card title="Acceso al portal">
          {p.user_id ? (
            <Alert tone="primary">Cuenta activa{p.privacy_accepted_at ? ` · aviso de privacidad aceptado ${fmtDate(p.privacy_accepted_at)}` : ""}.</Alert>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">{p.invited_at ? `Invitación enviada ${fmtDateTime(p.invited_at)}.` : "Aún no se ha invitado."}</p>
              <ActionForm action={async () => { "use server"; return resendInvite(id); }}>
                <SubmitButton variant="secondary" size="sm" pendingText="Enviando…">{p.invited_at ? "Reenviar invitación" : "Enviar invitación"}</SubmitButton>
              </ActionForm>
              <InviteLink patientId={id} />
            </>
          )}
        </Card>
        <Card title="Resumen">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Última medición</dt><dd>{last ? fmtDate(last.measured_at) : "—"}</dd>
            <dt className="text-muted">Peso</dt><dd>{last?.weight_kg ? `${last.weight_kg} kg` : "—"}</dd>
            <dt className="text-muted">IMC</dt><dd>{last?.results?.imc ? String(last.results.imc.value) : "—"}</dd>
            <dt className="text-muted">Plan activo</dt><dd>{plan.data ? `${plan.data.kcal_target} kcal` : "—"}</dd>
            <dt className="text-muted">Próxima cita</dt><dd>{nextAppt.data ? fmtDateTime(nextAppt.data.starts_at) : "—"}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <LinkButton size="sm" href={`/consultorio/mensajes/${id}`}>Mensajes</LinkButton>
            <LinkButton size="sm" href={`/api/pdf/expediente/${id}`} target="_blank">Expediente PDF</LinkButton>
          </div>
        </Card>
        <form action={async () => { "use server"; await setPatientActive(id, !p.active); }}>
          <Button variant="ghost" size="sm">{p.active ? "Marcar como inactivo" : "Reactivar paciente"}</Button>
        </form>
      </div>
    </div>
  );
}
