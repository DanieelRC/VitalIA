import Link from "next/link";
import { AdminBars } from "@/components/admin-charts";
import { Badge, Card, Empty, fmtDate, PageHeader, Stat } from "@/components/ui";
import { requireAdmin, type AdminClinic } from "@/lib/admin";
import { billingConfigured, billingTestMode } from "@/lib/billing/stripe";
import { mxn } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

type Metrics = {
  mrr: number; revenue_month: number; revenue_prev_month: number; revenue_total: number;
  revenue_12m: { month: string; total: number }[]; signups_12w: { week: string; count: number }[];
  clinics: { total: number; trial: number; paying: number; comp: number; manual: number; expired: number; cancelled: number; cancelling: number };
  conversion: number | null; ai_cost_month_usd: number; usd_mxn: number; active_patients: number;
  trials_ending_7d: number; payment_failed: number; cfdi_problems: number; arco_overdue: number;
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export default async function AdminDashboard() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: m }, { data: attention }] = await Promise.all([
    admin.rpc("admin_metrics"),
    admin.from("admin_clinics").select("id, name, owner_email, status, trial_ends_at, payment_failed_at, arco_overdue")
      .or(`payment_failed_at.not.is.null,arco_overdue.gt.0,and(status.eq.prueba,trial_ends_at.gt."${new Date().toISOString()}",trial_ends_at.lte."${new Date(Date.now() + 7 * 864e5).toISOString()}")`)
      .order("trial_ends_at", { ascending: true, nullsFirst: false }).limit(20),
  ]);
  const x = m as Metrics;
  const aiMxn = Number(x.ai_cost_month_usd) * Number(x.usd_mxn);
  const delta = x.revenue_prev_month ? Math.round(((x.revenue_month - x.revenue_prev_month) / x.revenue_prev_month) * 100) : null;
  const revenue = x.revenue_12m.map((r) => ({ mes: MONTHS[Number(r.month.slice(5)) - 1], total: Number(r.total) }));
  const signups = x.signups_12w.map((w) => ({ semana: `${Number(w.week.slice(8))}/${Number(w.week.slice(5, 7))}`, altas: Number(w.count) }));
  const rows = (attention ?? []) as Pick<AdminClinic, "id" | "name" | "owner_email" | "status" | "trial_ends_at" | "payment_failed_at" | "arco_overdue">[];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={billingConfigured() ? (billingTestMode() ? "Stripe en modo prueba: las cifras no son ingresos reales" : "Cobro real activo") : "Pagos en línea sin configurar"} />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Ingreso recurrente mensual (MRR)" value={mxn(Number(x.mrr))} hint="Suscripciones pagadas que no van a cancelar" />
          <Stat label="Ingresos de este mes" value={mxn(Number(x.revenue_month))} hint={delta == null ? `Mes anterior: ${mxn(Number(x.revenue_prev_month))}` : `${delta >= 0 ? "+" : ""}${delta}% vs. mes anterior`} />
          <Stat label="Costo de IA del mes" value={mxn(aiMxn)} hint={`$${Number(x.ai_cost_month_usd).toFixed(2)} USD · margen ${mxn(Number(x.revenue_month) - aiMxn)}`} />
          <Stat label="Conversión de prueba a pago" value={x.conversion == null ? "—" : `${x.conversion}%`} hint="Consultorios con la prueba ya terminada" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Pagando" value={x.clinics.paying} hint={x.clinics.cancelling ? `${x.clinics.cancelling} cancelan al fin del periodo` : undefined} />
          <Stat label="En prueba" value={x.clinics.trial} hint={`${x.trials_ending_7d} terminan en 7 días`} />
          <Stat label="Cortesía" value={x.clinics.comp} />
          <Stat label="Activos sin cobro" value={x.clinics.manual} hint="Fundadores o alta manual" />
          <Stat label="Vencidos" value={x.clinics.expired} />
          <Stat label="Pacientes activos" value={x.active_patients} hint={`${x.clinics.total} consultorios en total`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Ingresos por mes"><AdminBars data={revenue} xKey="mes" yKey="total" label="Ingresos" money /></Card>
          <Card title="Nuevos consultorios por semana"><AdminBars data={signups} xKey="semana" yKey="altas" label="Altas" /></Card>
        </div>

        <Card title="Requiere atención" actions={
          <span className="flex flex-wrap gap-2">
            {x.payment_failed > 0 && <Badge tone="danger">{x.payment_failed} cobros fallidos</Badge>}
            {x.cfdi_problems > 0 && <Link href="/admin/pagos?cfdi=problemas"><Badge tone="warn">{x.cfdi_problems} facturas pendientes</Badge></Link>}
            {x.arco_overdue > 0 && <Badge tone="danger">{x.arco_overdue} ARCO vencidas</Badge>}
          </span>}>
          {!rows.length ? <Empty>Todo en orden.</Empty> : (
            <ul className="divide-y divide-border">
              {rows.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <Link href={`/admin/consultorios/${c.id}`} className="min-w-0">
                    <span className="font-semibold hover:underline">{c.name}</span>
                    <span className="block truncate text-xs text-muted">{c.owner_email}</span>
                  </Link>
                  <span className="flex flex-wrap gap-1.5">
                    {c.payment_failed_at && <Badge tone="danger">Cobro rechazado</Badge>}
                    {c.arco_overdue > 0 && <Badge tone="danger">{c.arco_overdue} ARCO vencida{c.arco_overdue > 1 ? "s" : ""}</Badge>}
                    {c.status === "prueba" && c.trial_ends_at && <Badge tone="info">Prueba termina {fmtDate(c.trial_ends_at)}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
