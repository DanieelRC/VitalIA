import { redirect } from "next/navigation";
import { Alert, Badge, Card, cn, Empty, fmtDate, PageHeader, Table, Td } from "@/components/ui";
import { cfdiConfigured } from "@/lib/billing/cfdi";
import { CFDI_STATUS } from "@/lib/billing/map";
import { billingConfigured, billingTestMode } from "@/lib/billing/stripe";
import { confirmCheckoutSession } from "@/lib/billing/sync";
import { mxn } from "@/lib/payments";
import { getSubscription } from "@/lib/plan";
import { createClient, requireRole } from "@/lib/supabase/server";
import { ActivateButton, FiscalForm, PlanChoice, PortalButton, RetryCfdi } from "./plan-choice";
import { CancelButton } from "./cancel-button";
import { Download, FileText } from "lucide-react";

export const metadata = { title: "Suscripción" };

const STATUS = {
  prueba: { label: "Prueba", tone: "info" },
  activa: { label: "Activa", tone: "primary" },
  vencida: { label: "Vencida", tone: "danger" },
  cancelada: { label: "Cancelada", tone: "neutral" },
} as const;

const peso = (n: number) => `$${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;

type Search = { aviso?: string; pago?: string; session_id?: string };

export default async function Subscription({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("nutriologo");
  const [sub, sp] = await Promise.all([getSubscription(), searchParams]);
  if (!sub) redirect("/login?error=sin-consultorio");
  if (sp.pago === "ok" && sp.session_id && sub.isOwner) {
    const ok = await confirmCheckoutSession(sp.session_id, sub.clinicId);
    redirect(`/consultorio/suscripcion?pago=${ok ? "listo" : "confirmando"}`);
  }

  const billing = billingConfigured();
  const supabase = await createClient();
  const [{ data: profile }, { data: invoices }] = sub.isOwner
    ? await Promise.all([
        supabase.from("billing_profiles").select("rfc, legal_name, tax_regime, zip, cfdi_use, email").maybeSingle(),
        supabase.from("billing_invoices").select("id, amount_mxn, description, period_start, period_end, paid_at, receipt_url, cfdi_id, cfdi_status, cfdi_error").order("paid_at", { ascending: false }).limit(24),
      ])
    : [{ data: null }, { data: null }];

  const max = sub.plan.max_patients;
  const pct = max ? Math.min(100, Math.round((sub.activePatients / max) * 100)) : 0;
  const st = STATUS[sub.status];
  const inTrial = sub.status === "prueba" && sub.active && !sub.stripeSubscribed;
  const mode = sub.stripeSubscribed ? "change" : inTrial ? "trial" : "subscribe";

  return (
    <>
      <PageHeader title="Suscripción" subtitle={sub.clinicName} />
      <div className="flex flex-col gap-4">
        {sp.aviso === "limite" && <Alert tone="warn">No se pudo reactivar al paciente: tu plan ya está en su límite de pacientes activos.</Alert>}
        {sp.pago === "listo" && <Alert tone="primary">¡Listo! Tu suscripción quedó activa. Te enviaremos tu factura cuando se registre cada pago.</Alert>}
        {sp.pago === "confirmando" && <Alert tone="info">Estamos confirmando tu pago con el banco. Esta página se actualizará en unos minutos.</Alert>}
        {sp.pago === "cancelado" && <Alert tone="info">No se hizo ningún cargo. Puedes suscribirte cuando quieras.</Alert>}
        {sub.paymentFailedAt && <Alert tone="danger">No pudimos cobrar tu suscripción el {fmtDate(sub.paymentFailedAt)}. Volveremos a intentarlo; actualiza tu tarjeta en «Tarjeta y recibos» para no perder el acceso.</Alert>}
        {sub.isOwner && billing && billingTestMode() && <Alert tone="warn">Modo de prueba de Stripe: no se hacen cargos reales. Usa la tarjeta 4242 4242 4242 4242.</Alert>}

        <Card title="Tu plan" actions={<Badge tone={st.tone}>{st.label}</Badge>}>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="font-display text-2xl font-bold tracking-tight">{sub.plan.name}</p>
              <p className="mt-1 text-sm text-muted">
                {sub.status === "prueba" && sub.endsAt && (sub.active ? `Prueba gratuita hasta el ${fmtDate(sub.endsAt)}` : `La prueba terminó el ${fmtDate(sub.endsAt)}`)}
                {sub.status === "activa" && (sub.compUntil ? `Cortesía de VitalIA hasta el ${fmtDate(sub.compUntil)}` : sub.endsAt ? `${sub.cancelAtPeriodEnd || !sub.stripeSubscribed ? "Vigente hasta" : "Se renueva"} el ${fmtDate(sub.endsAt)}` : "Vigente")}
                {sub.status === "activa" && sub.stripeSubscribed && sub.plan.price_mxn != null && ` · ${peso(sub.plan.price_mxn)} al mes, IVA incluido`}
                {(sub.status === "vencida" || sub.status === "cancelada") && "Puedes consultar tu información, pero no agregar pacientes ni usar el asistente."}
              </p>
            </div>
            <p className="text-sm tabular-nums">
              <span className="font-display text-3xl font-bold">{sub.activePatients}</span>
              <span className="text-muted"> {max ? `de ${max}` : ""} pacientes activos</span>
            </p>
          </div>
          {max != null && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={sub.activePatients} aria-valuemin={0} aria-valuemax={max} aria-label="Pacientes activos">
              <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out-expo", pct >= 100 ? "bg-warn" : "bg-primary")} style={{ width: `${pct}%` }} />
            </div>
          )}
          <p className="mt-3 text-xs text-muted">Solo cuentan los pacientes activos. Un paciente inactivo conserva su expediente y puedes reactivarlo cuando vuelva.</p>
          {sub.cancelAtPeriodEnd && sub.endsAt && <div className="mt-3"><Alert tone="warn">Cancelaste tu suscripción. Conservas el acceso hasta el {fmtDate(sub.endsAt)} y no se te volverá a cobrar; después podrás consultar y exportar tu información, pero no agregar pacientes ni usar la IA.</Alert></div>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-3">
              {sub.isOwner && inTrial && <ActivateButton code={sub.plan.code} price={sub.plan.price_mxn} billing={billing} />}
              {sub.isOwner && billing && sub.hasStripeCustomer && <PortalButton />}
              <a href="/api/exportar-consultorio" download className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Download className="size-4" /> Exportar todo mi consultorio (JSON)</a>
            </div>
            {sub.isOwner && sub.active && sub.stripeSubscribed && <CancelButton cancelled={sub.cancelAtPeriodEnd} endsLabel={sub.endsAt ? `el ${fmtDate(sub.endsAt)}` : "el fin del periodo"} />}
          </div>
          {sub.isOwner && inTrial && <p className="mt-2 text-xs text-muted">Si te suscribes ahora, conservas los días de prueba que te quedan y el primer cobro se hace al terminar.</p>}
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sub.plans.map((p) => {
            const current = p.code === sub.plan.code;
            const tooSmall = p.max_patients != null && sub.activePatients > p.max_patients;
            return (
              <section key={p.code} className={cn("flex flex-col gap-3 rounded-2xl border bg-surface p-4 shadow-soft transition-[border-color,box-shadow] duration-200",
                current ? "border-primary ring-4 ring-primary/10" : "border-border hover:shadow-lift")}>
                <div>
                  <h2 className="font-display text-lg font-bold tracking-tight">{p.name}</h2>
                  <p className="text-sm text-muted">{p.max_patients ? `Hasta ${p.max_patients} pacientes activos` : "Pacientes ilimitados"}</p>
                </div>
                <div>
                  <p className="font-display text-xl font-bold">{p.price_mxn != null ? <>{peso(p.price_mxn)} <span className="text-sm font-medium text-muted">/mes</span></> : <span className="text-base text-muted">Precio por definir</span>}</p>
                  {p.price_mxn != null && <p className="text-xs text-muted">IVA incluido</p>}
                </div>
                <ul className="flex-1 space-y-1 text-sm">
                  <li>Expediente, planes y portal del paciente</li>
                  <li>Copiloto de consulta con IA</li>
                  <li className="text-muted">Hasta ${p.ai_budget_usd} USD/mes de IA</li>
                </ul>
                {sub.isOwner
                  ? <PlanChoice code={p.code} name={p.name} price={p.price_mxn} current={current} disabled={tooSmall || p.price_mxn == null && mode !== "trial"} mode={mode} billing={billing} />
                  : current && <p className="text-sm font-semibold text-primary">Tu plan actual</p>}
                {sub.isOwner && tooSmall && !current && <p className="text-xs text-muted">Tienes más pacientes activos de los que incluye.</p>}
              </section>
            );
          })}
        </div>
        {!sub.isOwner && <p className="text-sm text-muted">Solo la persona titular del consultorio puede cambiar el plan y ver los pagos.</p>}
        {sub.isOwner && !billing && <p className="text-sm text-muted">Los pagos en línea todavía no están activos. Mientras tanto, para contratar un plan escríbenos.</p>}

        {sub.isOwner && (
          <>
            <Card title="Datos de facturación">
              <p className="mb-3 text-sm text-muted">
                Con estos datos timbramos tu CFDI 4.0 en cada pago y te lo enviamos por correo. Deben coincidir con tu Constancia de Situación Fiscal.
                {!cfdiConfigured() && " La facturación automática todavía no está activa; tus datos quedan guardados."}
              </p>
              <FiscalForm profile={profile} />
            </Card>

            <Card title="Pagos y facturas">
              {!invoices?.length ? <Empty>Aún no hay pagos registrados.</Empty> : (
                <Table head={["Fecha", "Concepto", "Importe", "Factura", ""]}>
                  {invoices.map((i) => {
                    const cs = CFDI_STATUS[i.cfdi_status] ?? CFDI_STATUS.pendiente;
                    return (
                      <tr key={i.id} className="border-t border-border">
                        <Td className="whitespace-nowrap">{fmtDate(i.paid_at)}</Td>
                        <Td>{i.description}{i.period_end && <span className="block text-xs text-muted">Periodo al {fmtDate(i.period_end)}</span>}</Td>
                        <Td className="whitespace-nowrap tabular-nums">{mxn(Number(i.amount_mxn))}</Td>
                        <Td><Badge tone={cs.tone}>{cs.label}</Badge>{i.cfdi_status === "error" && i.cfdi_error && <span className="mt-1 block max-w-64 text-xs text-danger">{i.cfdi_error}</span>}</Td>
                        <Td className="whitespace-nowrap text-right">
                          {i.cfdi_status === "timbrada" && i.cfdi_id ? (
                            <span className="inline-flex gap-3 text-xs font-semibold">
                              <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`/api/facturas/${i.id}/pdf`}><FileText className="size-3.5" />PDF</a>
                              <a className="text-primary hover:underline" href={`/api/facturas/${i.id}/xml`}>XML</a>
                            </span>
                          ) : ["sin_datos", "error", "no_configurado"].includes(i.cfdi_status) ? <RetryCfdi id={i.id} /> : null}
                          {i.receipt_url && <a className="ml-3 text-xs text-muted hover:underline" href={i.receipt_url} target="_blank" rel="noopener noreferrer">Recibo</a>}
                        </Td>
                      </tr>
                    );
                  })}
                </Table>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
