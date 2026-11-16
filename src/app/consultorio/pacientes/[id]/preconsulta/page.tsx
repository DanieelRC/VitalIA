import Link from "next/link";
import { Alert, Badge, Card, Empty, fmtDate, fmtDateTime, fmtNum } from "@/components/ui";
import { getPatient } from "@/lib/data";
import { LAB_BY_KEY, labFlag } from "@/lib/nutrition/labs";
import { createClient } from "@/lib/supabase/server";

const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

// Todo lo que pasó desde la última consulta, en una sola página, para leerlo antes de recibir al paciente.
export default async function PreConsult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPatient(id);
  const supabase = await createClient();
  const base = `/consultorio/pacientes/${id}`;

  const { data: lastCons } = await supabase.from("consultations").select("consulted_at, plan").eq("patient_id", id).order("consulted_at", { ascending: false }).limit(1).maybeSingle();
  const since = lastCons?.consulted_at ?? new Date(Date.now() - 30 * 864e5).toISOString();
  const sinceDay = since.slice(0, 10);

  const [progress, anthro, recalls, plan, daily, photos, asked, unread, labs, next] = await Promise.all([
    supabase.from("progress_logs").select("logged_at, weight_kg, waist_cm, adherence, exercise_minutes, notes").eq("patient_id", id).gte("logged_at", sinceDay).order("logged_at"),
    supabase.from("anthropometry").select("measured_at, weight_kg").eq("patient_id", id).order("measured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("recalls_24h").select("recall_date, totals, captured_by").eq("patient_id", id).gte("recall_date", sinceDay).order("recall_date", { ascending: false }),
    supabase.from("meal_plans").select("id, name, kcal_target").eq("patient_id", id).eq("status", "activo").maybeSingle(),
    supabase.from("daily_logs").select("day, water_glasses, satiety, digestion, energy").eq("patient_id", id).gte("day", sinceDay),
    supabase.from("meal_photos").select("id, comment").eq("patient_id", id).gte("eaten_at", since),
    p.user_id
      ? supabase.from("ai_messages").select("content, blocked_reason, created_at").eq("user_id", p.user_id).eq("role", "user").gte("created_at", since).order("created_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [] as { content: string; blocked_reason: string | null; created_at: string }[] }),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("patient_id", id).is("read_at", null).eq("sender_id", p.user_id ?? "00000000-0000-0000-0000-000000000000"),
    supabase.from("lab_results").select("taken_on, values").eq("patient_id", id).order("taken_on", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("appointments").select("starts_at, status, reason").eq("patient_id", id).gte("starts_at", new Date().toISOString()).neq("status", "cancelada").order("starts_at").limit(1).maybeSingle(),
  ]);

  const logs = progress.data ?? [];
  const weights = logs.filter((l) => l.weight_kg != null);
  const startW = anthro.data?.weight_kg ?? weights[0]?.weight_kg ?? null;
  const endW = weights.at(-1)?.weight_kg ?? null;
  const dW = startW != null && endW != null ? Math.round((Number(endW) - Number(startW)) * 10) / 10 : null;
  const adh = avg(logs.map((l) => l.adherence));
  const exercise = logs.reduce((a, l) => a + (l.exercise_minutes ?? 0), 0);
  const kcalTarget = plan.data ? Number(plan.data.kcal_target) : null;
  const d = daily.data ?? [];
  const flagged = (asked.data ?? []).filter((m) => m.blocked_reason);
  const pendingPhotos = (photos.data ?? []).filter((f) => !f.comment).length;
  const outOfRange = Object.entries((labs.data?.values ?? {}) as Record<string, number>)
    .map(([k, v]) => ({ k, v, flag: labFlag(k, Number(v)) })).filter((x) => x.flag && x.flag !== "normal");

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        {lastCons ? <>Desde la última consulta, el <strong className="text-text">{fmtDate(lastCons.consulted_at)}</strong>.</> : "Sin consultas previas: se muestran los últimos 30 días."}
        {next.data && <> Próxima cita: <strong className="text-text">{fmtDateTime(next.data.starts_at)}</strong>{next.data.reason ? ` · ${next.data.reason}` : ""}.</>}
      </p>

      {flagged.length > 0 && (
        <Alert tone="danger">
          <strong>Señal de alarma.</strong> El paciente escribió al asistente {flagged.some((f) => f.blocked_reason === "eating_disorder") ? "sobre conductas de riesgo alimentario" : "un síntoma de urgencia"} ({fmtDate(flagged[0].created_at)}). El asistente respondió con el mensaje de seguridad; conviene abordarlo en consulta.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Peso">
          <p className="font-display text-3xl font-extrabold tabular">{dW == null ? "—" : `${dW > 0 ? "+" : ""}${dW} kg`}</p>
          <p className="mt-1 text-sm text-muted">{startW != null && endW != null ? `De ${startW} a ${endW} kg · ${weights.length} registro${weights.length === 1 ? "" : "s"} en casa` : "Sin registros de peso en el periodo."}</p>
        </Card>
        <Card title="Apego al plan">
          <p className="font-display text-3xl font-extrabold tabular">{adh == null ? "—" : `${fmtNum(adh)} / 5`}</p>
          <p className="mt-1 text-sm text-muted">{logs.length ? `${logs.length} registro${logs.length === 1 ? "" : "s"} · ${exercise} min de ejercicio` : "No registró apego en el periodo."}</p>
        </Card>
        <Card title="Su día a día">
          {d.length ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Agua</dt><dd className="tabular font-semibold">{fmtNum(avg(d.map((x) => x.water_glasses)))} vasos/día</dd>
              <dt className="text-muted">Energía</dt><dd className="tabular font-semibold">{fmtNum(avg(d.map((x) => x.energy)))} / 5</dd>
              <dt className="text-muted">Saciedad</dt><dd className="tabular font-semibold">{fmtNum(avg(d.map((x) => x.satiety)))} / 5</dd>
              <dt className="text-muted">Digestión</dt><dd className="tabular font-semibold">{fmtNum(avg(d.map((x) => x.digestion)))} / 5</dd>
            </dl>
          ) : <p className="text-sm text-muted">Sin registros de agua ni síntomas.</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Lo que comió (recordatorios de 24 h)" actions={<Link className="text-sm text-primary" href={`${base}/r24h`}>Ver todos</Link>}>
          {recalls.data?.length ? (
            <ul className="divide-y divide-border text-sm">
              {recalls.data.slice(0, 6).map((r, i) => {
                const kcal = Number((r.totals as { kcal?: number })?.kcal ?? 0);
                const pct = kcalTarget && kcal ? Math.round((kcal / kcalTarget) * 100) : null;
                return (
                  <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                    <span>{fmtDate(r.recall_date)} <span className="text-xs text-muted">· {r.captured_by === "paciente" ? "lo llenó el paciente" : "en consulta"}</span></span>
                    <span className="tabular">{kcal ? `${Math.round(kcal)} kcal` : "—"} {pct != null && <Badge tone={pct > 110 || pct < 85 ? "warn" : "primary"}>{pct} %</Badge>}</span>
                  </li>
                );
              })}
            </ul>
          ) : <Empty>Sin recordatorios en el periodo.</Empty>}
          {plan.data && <p className="mt-2 text-xs text-muted">Meta del plan activo ({plan.data.name}): {Math.round(kcalTarget!)} kcal.</p>}
        </Card>

        <Card title="Lo que le preguntó a Vita">
          {asked.data?.length ? (
            <ul className="grid gap-1.5 text-sm">
              {asked.data.map((m, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 text-xs text-muted tabular">{fmtDate(m.created_at, { day: "2-digit", month: "short" })}</span>
                  <span className={m.blocked_reason ? "font-medium text-danger" : ""}>{m.content.length > 140 ? m.content.slice(0, 140) + "…" : m.content}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>No ha usado el asistente en el periodo.</Empty>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Pendientes">
          <ul className="grid gap-1.5 text-sm">
            <li><Link className="text-primary" href={`/consultorio/mensajes/${id}`}>{unread.count ? `${unread.count} mensaje${unread.count === 1 ? "" : "s"} sin leer` : "Mensajes al día"}</Link></li>
            <li><Link className="text-primary" href={`${base}/comidas`}>{photos.data?.length ? `${photos.data.length} foto${photos.data.length === 1 ? "" : "s"} de comida${pendingPhotos ? ` · ${pendingPhotos} por comentar` : ""}` : "Sin fotos de comida"}</Link></li>
          </ul>
        </Card>
        <Card title="Laboratorios" actions={<Link className="text-sm text-primary" href={`${base}/laboratorios`}>Ver</Link>}>
          {labs.data ? (
            outOfRange.length
              ? <ul className="grid gap-1 text-sm">{outOfRange.map((x) => <li key={x.k} className="flex justify-between gap-2"><span>{LAB_BY_KEY[x.k]?.label ?? x.k}</span><span className="tabular">{x.v} {LAB_BY_KEY[x.k]?.unit} <Badge tone={x.flag === "alto" ? "danger" : "warn"}>{x.flag}</Badge></span></li>)}</ul>
              : <p className="text-sm text-muted">Últimos resultados ({fmtDate(labs.data.taken_on)}) dentro de rango.</p>
          ) : <p className="text-sm text-muted">Sin laboratorios capturados.</p>}
        </Card>
        <Card title="Plan acordado en la última consulta">
          <p className="whitespace-pre-wrap text-sm">{lastCons?.plan || <span className="text-muted">Sin plan registrado.</span>}</p>
        </Card>
      </div>

      {logs.some((l) => l.notes) && (
        <Card title="Comentarios del paciente en sus registros">
          <ul className="grid gap-1.5 text-sm">{logs.filter((l) => l.notes).slice(-6).map((l, i) => <li key={i}><span className="text-xs text-muted tabular">{fmtDate(l.logged_at)}</span> “{l.notes}”</li>)}</ul>
        </Card>
      )}
    </div>
  );
}
