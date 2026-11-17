import Link from "next/link";
import { Bot, Calculator, SlidersHorizontal, UserPlus } from "lucide-react";
import { Badge, Card, Empty, fmtDateTime } from "@/components/ui";
import { getSession } from "@/lib/supabase/server";
import { CLINIC_TZ } from "@/lib/time";
import { followUpAlerts, type AlertKind } from "@/lib/alerts";
import { createClient } from "@/lib/supabase/server";
import { getSubscription } from "@/lib/plan";

const ALERT_TONE: Record<AlertKind, "danger" | "warn" | "info" | "neutral"> = { alarma: "danger", apego: "warn", inactivo: "neutral", fotos: "info" };
const ALERT_LABEL: Record<AlertKind, string> = { alarma: "Alarma", apego: "Apego bajo", inactivo: "Sin actividad", fotos: "Por comentar" };

export const metadata = { title: "Inicio" };

export default async function Dashboard() {
  const supabase = await createClient();
  const session = await getSession();
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: CLINIC_TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const today = new Intl.DateTimeFormat("es-MX", { timeZone: CLINIC_TZ, weekday: "long", day: "numeric", month: "long" }).format(now);
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
  const sub = await getSubscription();
  const spent = (usage.data ?? []).reduce((a, r) => a + Number(r.cost_usd), 0);
  const budget = Math.min(Number(settings.data?.monthly_budget_usd ?? 0), sub?.plan.ai_budget_usd ?? Infinity);
  // Mensajes sin leer enviados por pacientes (los del nutriólogo se marcan al abrir el hilo)
  const threads = new Map<string, { name: string; body: string; at: string; n: number }>();
  for (const m of unread.data ?? []) {
    const t = threads.get(m.patient_id);
    const name = (m.patients as unknown as { full_name: string } | null)?.full_name ?? "";
    if (t) t.n++; else threads.set(m.patient_id, { name, body: m.body, at: m.created_at, n: 1 });
  }

  return (
    <>
      <section className="overflow-hidden rounded-3xl bg-field text-field-fg shadow-lift">
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-6 sm:px-8 sm:pt-8">
          <div>
            <p className="text-sm text-field-muted first-letter:uppercase">{today}</p>
            <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{greeting}{session?.fullName ? `, ${session.fullName.split(" ")[0]}` : ""}</h1>
          </div>
          <Link href="/consultorio/pacientes/nuevo" className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--g-frutas)] px-5 text-sm font-bold text-[#16300a] transition-[filter,transform] hover:brightness-110 active:scale-[0.97]"><UserPlus className="size-4" />Nuevo paciente</Link>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-px bg-field-2 lg:grid-cols-4">
          {([
            ["Pacientes activos", patients.count ?? 0, "/consultorio/pacientes", null],
            ["Citas por confirmar", pending.count ?? 0, "/consultorio/agenda", null],
            ["Mensajes sin leer", threads.size, "/consultorio/mensajes", null],
            ["Gasto de IA del mes", `$${spent.toFixed(2)}`, "/consultorio/ajustes", budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0],
          ] as const).map(([label, value, href, pct]) => (
            <Link key={label} href={href} className="group bg-field px-5 py-5 transition-colors hover:bg-field-2 sm:px-8">
              <dt className="text-xs text-field-muted">{label}</dt>
              <dd className="tabular mt-1 font-display text-3xl font-extrabold tracking-tight">{value}</dd>
              {pct != null && (
                <dd className="mt-2"><span className="block h-1.5 overflow-hidden rounded-full bg-field-2 group-hover:bg-field"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? "var(--g-aoa)" : "var(--g-frutas)" }} /></span><span className="tabular mt-1 block text-[11px] text-field-muted">{pct} % de ${budget.toFixed(2)} USD</span></dd>
              )}
            </Link>
          ))}
        </dl>
      </section>
      <nav aria-label="Accesos rápidos" className="mt-4 grid gap-3 sm:grid-cols-3">
        {([
          ["/consultorio/formulas", Calculator, "Calculadora", "Composición, energía, macros y más, con rangos"],
          ["/consultorio/asistente", Bot, "Asistente", "Calcula con tus fórmulas y lee a tus pacientes"],
          ["/consultorio/personalizar", SlidersHorizontal, "Personalizar", "Distribuciones, fórmulas, equivalentes y PDF"],
        ] as const).map(([href, Icon, title, text]) => (
          <Link key={href} href={href} className="group flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft transition-[box-shadow,transform,border-color] duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon className="size-5" /></span>
            <span className="min-w-0"><span className="block font-semibold">{title}</span><span className="block text-sm text-muted">{text}</span></span>
          </Link>
        ))}
      </nav>
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
