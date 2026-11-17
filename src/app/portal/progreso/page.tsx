import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionForm, ConfirmButton, SubmitButton, type FormState } from "@/components/form";
import { ProgressChart } from "@/components/progress-chart";
import { Card, Empty, Field, fmtDate, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { createClient, requireRole } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/time";

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export const metadata = { title: "Mi progreso" };

const num = z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(",", "."))), z.number().positive().max(500).nullable());

async function addLog(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const s = await requireRole("paciente");
  const d = z.object({
    logged_at: z.iso.date(), weight_kg: num, waist_cm: num, hip_cm: num,
    adherence: z.preprocess((v) => (v ? Number(v) : null), z.number().int().min(1).max(5).nullable()),
    exercise_minutes: z.preprocess((v) => (v ? Number(v) : null), z.number().int().min(0).max(1440).nullable()),
    notes: z.string().max(2000).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: "Revisa los valores." };
  if (!d.data.weight_kg && !d.data.waist_cm && !d.data.adherence && !d.data.notes) return { error: "Registra al menos un dato." };
  const supabase = await createClient();
  const { error } = await supabase.from("progress_logs").insert({ ...d.data, notes: d.data.notes || null, patient_id: s.patientId });
  if (error) return { error: error.message };
  revalidatePath("/portal/progreso");
  return { ok: "¡Registro guardado!" };
}

async function removeLog(id: string) {
  "use server";
  await requireRole("paciente");
  const supabase = await createClient();
  await supabase.from("progress_logs").delete().eq("id", id);
  revalidatePath("/portal/progreso");
}

export default async function MyProgress() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const [logs, anthro, me, checks, plan] = await Promise.all([
    supabase.from("progress_logs").select("*").eq("patient_id", s.patientId!).order("logged_at", { ascending: false }).limit(200),
    supabase.from("my_anthropometry").select("measured_at, weight_kg, results").eq("patient_id", s.patientId!).order("measured_at"),
    supabase.from("my_patient").select("target_weight_kg").maybeSingle(),
    supabase.from("meal_checks").select("day, done").eq("patient_id", s.patientId!).eq("done", true).gte("day", addDays(todayLocal(), -6)),
    supabase.from("meal_plans").select("meals").eq("patient_id", s.patientId!).eq("status", "activo").maybeSingle(),
  ]);
  const rows = logs.data ?? [];
  const chart = [
    ...(anthro.data ?? []).map((a) => ({ t: a.measured_at, date: fmtDate(a.measured_at, { day: "2-digit", month: "short" }), consulta: a.weight_kg, casa: null })),
    ...rows.map((r) => ({ t: r.logged_at, date: fmtDate(r.logged_at, { day: "2-digit", month: "short" }), consulta: null, casa: r.weight_kg })),
  ].sort((a, b) => a.t.localeCompare(b.t));

  // Meta de peso (la fija el nutriólogo)
  const weights = chart.map((c) => Number(c.consulta ?? c.casa)).filter((v) => v > 0);
  const goal = me.data?.target_weight_kg ? Number(me.data.target_weight_kg) : null;
  const first = weights[0] ?? null, current = weights.at(-1) ?? null;
  const span = goal != null && first != null ? first - goal : 0;
  const advance = goal != null && first != null && current != null && span !== 0 ? Math.max(0, Math.min(100, Math.round(((first - current) / span) * 100))) : null;
  const left = goal != null && current != null ? Math.round(Math.abs(current - goal) * 10) / 10 : null;
  const reached = goal != null && current != null && first != null && (span >= 0 ? current <= goal : current >= goal);

  // Últimos 7 días: comidas marcadas como hechas
  const mealsPerDay = ((plan.data?.meals as unknown[]) ?? []).length;
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(todayLocal(), i - 6);
    return { day, n: (checks.data ?? []).filter((c) => c.day === day).length };
  });

  return (
    <>
      <PageHeader title="Mi progreso" />
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl bg-field p-5 text-field-fg shadow-lift sm:p-6">
          <p className="text-sm text-field-muted">Mi meta de peso</p>
          {goal != null && current != null && first != null ? (
            <>
              <p className="tabular mt-1 font-display text-4xl font-extrabold tracking-tight">{reached ? "¡Meta alcanzada!" : <>{left} kg <span className="text-base font-semibold text-field-muted">para tu meta</span></>}</p>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-field-2" role="img" aria-label={`Avance hacia la meta: ${advance ?? 0} %`}>
                <div className="h-full rounded-full bg-[var(--g-frutas)] transition-[width] duration-700 ease-out-expo" style={{ width: `${reached ? 100 : advance ?? 0}%` }} />
              </div>
              <dl className="tabular mt-3 grid grid-cols-3 text-sm">
                <div><dt className="text-xs text-field-muted">Inicio</dt><dd className="font-semibold">{first} kg</dd></div>
                <div className="text-center"><dt className="text-xs text-field-muted">Hoy</dt><dd className="font-semibold">{current} kg</dd></div>
                <div className="text-right"><dt className="text-xs text-field-muted">Meta</dt><dd className="font-semibold">{goal} kg</dd></div>
              </dl>
            </>
          ) : (
            <p className="mt-2 max-w-prose text-sm text-field-muted">{goal == null ? "Tu nutriólogo todavía no define una meta de peso contigo. Pregúntale en tu próxima cita o por Mensajes." : "Registra tu peso para ver cuánto te falta para tu meta."}</p>
          )}
        </section>
        <section className="rounded-3xl border border-border bg-surface p-5 shadow-soft sm:p-6">
          <p className="text-sm text-muted">Comidas de mi plan esta semana</p>
          <ol className="mt-4 flex items-end justify-between gap-2">
            {week.map((d) => {
              const ratio = mealsPerDay ? Math.min(1, d.n / mealsPerDay) : 0;
              return (
                <li key={d.day} className="flex flex-1 flex-col items-center gap-1.5" title={`${d.n} de ${mealsPerDay} comidas`}>
                  <span className="tabular text-xs font-semibold">{d.n || ""}</span>
                  <span className="flex h-20 w-full max-w-9 items-end overflow-hidden rounded-xl bg-surface-2"><span className="w-full rounded-xl bg-primary transition-[height] duration-500" style={{ height: `${ratio * 100}%` }} /></span>
                  <span className="text-[11px] text-muted first-letter:uppercase">{fmtDate(d.day, { weekday: "short" }).replace(".", "")}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-muted">{mealsPerDay ? `Marca «Ya comí» en Inicio; tu plan tiene ${mealsPerDay} comidas al día.` : "Cuando tengas un plan activo verás aquí tu constancia."}</p>
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card title="Evolución de peso">
          <ProgressChart data={chart} goal={goal} series={[{ key: "consulta", label: "En consulta" }, { key: "casa", label: "Registro en casa" }]} />
        </Card>
        <Card title="Nuevo registro">
          <ActionForm action={addLog} resetOnOk className="grid grid-cols-2 gap-3">
            <Field label="Fecha" className="col-span-2"><Input type="date" name="logged_at" defaultValue={todayLocal()} /></Field>
            <Field label="Peso (kg)"><Input name="weight_kg" inputMode="decimal" /></Field>
            <Field label="Cintura (cm)"><Input name="waist_cm" inputMode="decimal" /></Field>
            <Field label="Cadera (cm)"><Input name="hip_cm" inputMode="decimal" /></Field>
            <Field label="Ejercicio (min)"><Input name="exercise_minutes" inputMode="numeric" /></Field>
            <Field label="¿Cómo te fue con tu plan?" className="col-span-2">
              <Select name="adherence" defaultValue=""><option value="">—</option><option value="5">Excelente</option><option value="4">Bien</option><option value="3">Regular</option><option value="2">Difícil</option><option value="1">Muy difícil</option></Select>
            </Field>
            <Field label="Comentarios" className="col-span-2"><Textarea name="notes" rows={2} /></Field>
            <div><SubmitButton size="sm">Guardar</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
      <Card className="mt-4" title="Mis registros">
        {rows.length ? (
          <Table head={["Fecha", "Peso", "Cintura", "Cadera", "Ejercicio", "Plan", ""]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>{fmtDate(r.logged_at)}</Td><Td>{r.weight_kg ?? "—"}</Td><Td>{r.waist_cm ?? "—"}</Td><Td>{r.hip_cm ?? "—"}</Td>
                <Td>{r.exercise_minutes ? `${r.exercise_minutes} min` : "—"}</Td><Td>{r.adherence ? `${r.adherence}/5` : "—"}</Td>
                <Td><form action={removeLog.bind(null, r.id)}><ConfirmButton message="¿Eliminar registro?">Eliminar</ConfirmButton></form></Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>Aún no tienes registros.</Empty>}
      </Card>
    </>
  );
}
