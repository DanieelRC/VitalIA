import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Empty, fmtDate, fmtDateTime, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ADMIN_ACTIONS, clinicLabel, requireAdmin, type AdminClinic } from "@/lib/admin";
import { CFDI_STATUS } from "@/lib/billing/map";
import { billingTestMode } from "@/lib/billing/stripe";
import { mxn } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/server";
import { AdminActions } from "./admin-forms";

export const metadata = { title: "Consultorio" };

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-4 border-t border-border py-2 text-sm first:border-t-0"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>
);

export default async function ClinicDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = createAdminClient();
  const [{ data }, { data: invoices }, { data: log }, { data: settings }] = await Promise.all([
    admin.from("admin_clinics").select("*").eq("id", id).maybeSingle(),
    admin.from("billing_invoices").select("id, paid_at, amount_mxn, description, cfdi_status").eq("clinic_id", id).order("paid_at", { ascending: false }).limit(24),
    admin.from("admin_actions").select("id, action, reason, at, admin_id").eq("clinic_id", id).order("at", { ascending: false }).limit(50),
    admin.from("clinic_settings").select("phone, license").eq("clinic_id", id).maybeSingle(),
  ]);
  if (!data) notFound();
  const c = data as AdminClinic;
  const st = clinicLabel(c);
  const cap = c.ai_budget_override_usd ?? Number(c.ai_budget_usd);
  const until = c.status === "prueba" ? c.trial_ends_at : c.in_comp ? c.comp_until : c.current_period_end;
  const stripeUrl = c.stripe_customer_id ? `https://dashboard.stripe.com/${billingTestMode() ? "test/" : ""}customers/${c.stripe_customer_id}` : null;

  return (
    <>
      <PageHeader title={c.name} subtitle={<Link href="/admin/consultorios" className="hover:underline">← Nutriólogos</Link>}
        actions={<Badge tone={st.tone}>{st.label}</Badge>} />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Plan" value={c.plan_name} hint={c.price_mxn != null ? `${mxn(Number(c.price_mxn))} al mes` : undefined} />
          <Stat label={c.status === "prueba" ? "Prueba hasta" : c.in_comp ? "Cortesía hasta" : "Vigente hasta"} value={until ? fmtDate(until) : "Sin vencimiento"}
            hint={c.cancel_at_period_end ? "Cancela al final del periodo" : c.payment_failed_at ? `Cobro rechazado el ${fmtDate(c.payment_failed_at)}` : undefined} />
          <Stat label="Pacientes activos" value={`${c.active_patients}`} hint={`${c.total_patients} en total`} />
          <Stat label="IA este mes" value={`$${Number(c.ai_cost_month).toFixed(2)}`} hint={`de $${cap} USD${c.ai_budget_override_usd != null ? " (tope propio)" : ""}`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Cuenta">
            <dl>
              <Row k="Titular" v={c.owner_name ?? "—"} />
              <Row k="Correo" v={<>{c.owner_email ?? "—"} {c.email_confirmed_at ? <Badge tone="primary">Confirmado</Badge> : <Badge tone="warn">Sin confirmar</Badge>}</>} />
              <Row k="Teléfono" v={settings?.phone ?? "—"} />
              <Row k="Cédula" v={settings?.license ?? "—"} />
              <Row k="Nutriólogos en el consultorio" v={c.staff_count} />
              <Row k="Último acceso del titular" v={c.last_sign_in_at ? fmtDateTime(c.last_sign_in_at) : "Nunca"} />
              <Row k="Alta" v={fmtDate(c.created_at)} />
              <Row k="Datos fiscales" v={c.has_fiscal ? "Capturados" : "Pendientes"} />
              <Row k="Stripe" v={stripeUrl ? <a href={stripeUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Ver cliente</a> : "Sin cliente"} />
              {c.arco_overdue > 0 && <Row k="Solicitudes ARCO vencidas" v={<Badge tone="danger">{c.arco_overdue}</Badge>} />}
            </dl>
          </Card>
          <Card title="Pagos" actions={<span className="text-sm text-muted">Total {mxn(Number(c.revenue_total))}</span>}>
            {!invoices?.length ? <Empty>Sin pagos.</Empty> : (
              <Table head={["Fecha", "Importe", "Factura"]}>
                {invoices.map((i) => {
                  const cs = CFDI_STATUS[i.cfdi_status] ?? CFDI_STATUS.pendiente;
                  return (
                    <tr key={i.id} className="border-t border-border">
                      <Td>{fmtDate(i.paid_at)}</Td>
                      <Td className="tabular-nums">{mxn(Number(i.amount_mxn))}</Td>
                      <Td><Badge tone={cs.tone}>{cs.label}</Badge></Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </div>

        <Card title="Acciones">
          <AdminActions clinicId={c.id} paying={c.paying} inComp={c.in_comp} plan={c.plan} aiOverride={c.ai_budget_override_usd == null ? null : Number(c.ai_budget_override_usd)}
            planCap={Number(c.ai_budget_usd)} unconfirmed={!c.email_confirmed_at} />
          <p className="mt-3 text-xs text-muted">Por privacidad, el panel no muestra datos de pacientes ni permite entrar como el nutriólogo.</p>
        </Card>

        <Card title="Historial de administración">
          {!log?.length ? <Empty>Sin acciones registradas.</Empty> : (
            <ul className="divide-y divide-border">
              {log.map((l) => (
                <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <span><strong>{ADMIN_ACTIONS[l.action] ?? l.action}</strong> · {l.reason}</span>
                  <span className="text-xs text-muted">{fmtDateTime(l.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
