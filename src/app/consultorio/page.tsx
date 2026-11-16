import Link from "next/link";
import { Badge, Card, Empty, fmtDateTime, LinkButton, PageHeader, Stat } from "@/components/ui";
import { followUpAlerts, type AlertKind } from "@/lib/alerts";
import { createClient } from "@/lib/supabase/server";

const ALERT_TONE: Record<AlertKind, "danger" | "warn" | "info" | "neutral"> = { alarma: "danger", apego: "warn", inactivo: "neutral", fotos: "info" };
const ALERT_LABEL: Record<AlertKind, string> = { alarma: "Alarma", apego: "Apego bajo", inactivo: "Sin actividad", fotos: "Por comentar" };

export const metadata = { title: "Inicio" };

export default async function Dashboard() {
  const supabase = await createClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [patients, appts, unread, usage, settings, pending, alerts] = await Promise.all([
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("appointments").select("id, starts_at, status, reason, patients(full_name)")
      .gte("starts_at", new Date().toISOString()).neq("status", "cancelada").order("starts_at").limit(8),
    supabase.from("messages").select("patient_id, body, created_at, patients(full_name)")
      .is("read_at", null).order("created_at", { ascending: false }).limit(50),
    supabase.from("ai_usage").select("cost_usd").gte("created_at", monthStart),
    supabase.from("ai_settings").select("monthly_budget_usd").single(),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "solicitada"),
    followUpAlerts(supabase),
  ]);
  const spent = (usage.data ?? []).reduce((a, r) => a + Number(r.cost_usd), 0);
  const budget = Number(settings.data?.monthly_budget_usd ?? 0);
  // Mensajes sin leer enviados por pacientes (los del nutriólogo se marcan al abrir el hilo)
  const threads = new Map<string, { name: string; body: string; at: string; n: number }>();
  for (const m of unread.data ?? []) {
    const t = threads.get(m.patient_id);
    const name = (m.patients as unknown as { full_name: string } | null)?.full_name ?? "";
    if (t) t.n++; else threads.set(m.patient_id, { name, body: m.body, at: m.created_at, n: 1 });
  }

  return (
    <>
      <PageHeader title="Inicio" actions={<LinkButton href="/consultorio/pacientes/nuevo" variant="primary">Nuevo paciente</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pacientes activos" value={patients.count ?? 0} />
        <Stat label="Citas por confirmar" value={pending.count ?? 0} />
        <Stat label="Mensajes sin leer" value={threads.size} />
        <Stat label="Gasto IA del mes" value={`$${spent.toFixed(2)}`} hint={`de $${budget.toFixed(2)} USD (${budget ? Math.round((spent / budget) * 100) : 0} %)`} />
      </div>
      <Card className="mt-4" title="Pacientes que necesitan atención">
        {alerts.length ? (
          <ul className="divide-y divide-border text-sm">
            {alerts.slice(0, 12).map((a, i) => (
              <li key={i}>
                <Link href={`/consultorio/pacientes/${a.patientId}/${a.kind === "fotos" ? "comidas" : "preconsulta"}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 transition-colors hover:text-primary">
                  <Badge tone={ALERT_TONE[a.kind]}>{ALERT_LABEL[a.kind]}</Badge>
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted">{a.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Todo en orden: nadie con señales de alarma, apego bajo ni inactividad.</p>}
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Próximas citas" actions={<Link href="/consultorio/agenda" className="text-sm text-primary">Ver agenda</Link>}>
          {appts.data?.length ? (
            <ul className="divide-y divide-border text-sm">
              {appts.data.map((a) => (
                <li key={a.id} className="flex justify-between gap-2 py-2">
                  <span>{(a.patients as unknown as { full_name: string } | null)?.full_name}</span>
                  <span className="text-muted">{fmtDateTime(a.starts_at)} · {a.status}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Sin citas próximas.</Empty>}
        </Card>
        <Card title="Mensajes" actions={<Link href="/consultorio/mensajes" className="text-sm text-primary">Bandeja</Link>}>
          {threads.size ? (
            <ul className="divide-y divide-border text-sm">
              {[...threads].map(([pid, t]) => (
                <li key={pid} className="py-2">
                  <Link href={`/consultorio/mensajes/${pid}`} className="flex justify-between gap-2">
                    <span className="font-medium">{t.name} <span className="text-xs text-primary">({t.n})</span></span>
                    <span className="truncate text-muted">{t.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty>No hay mensajes nuevos.</Empty>}
        </Card>
      </div>
    </>
  );
}
