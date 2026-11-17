import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionForm, ConfirmButton, SubmitButton, type FormState } from "@/components/form";
import { ProgressChart } from "@/components/progress-chart";
import { Badge, Card, Empty, Field, fmtDate, Input, Textarea } from "@/components/ui";
import { LABS, labFlag } from "@/lib/nutrition/labs";
import { rangeScale } from "@/lib/nutrition";
import { RangeGauge } from "@/components/range-gauge";
import { createClient, requireRole } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/time";

async function addLab(patientId: string, _: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireRole("nutriologo");
  const date = z.iso.date().safeParse(fd.get("taken_on"));
  if (!date.success) return { error: "Fecha no válida." };
  const values: Record<string, number> = {};
  for (const l of LABS) {
    const raw = String(fd.get(l.key) ?? "").trim().replace(",", ".");
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100000) return { error: `Valor no válido en ${l.label}.` };
    values[l.key] = n;
  }
  if (!Object.keys(values).length) return { error: "Captura al menos un resultado." };
  const supabase = await createClient();
  const { error } = await supabase.from("lab_results").insert({ patient_id: patientId, taken_on: date.data, values, notes: String(fd.get("notes") ?? "").trim().slice(0, 2000) || null });
  if (error) return { error: "No se pudo guardar." };
  revalidatePath(`/consultorio/pacientes/${patientId}/laboratorios`);
  return { ok: "Resultados guardados." };
}

async function removeLab(patientId: string, id: string) {
  "use server";
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from("lab_results").delete().eq("id", id).eq("patient_id", patientId);
  revalidatePath(`/consultorio/pacientes/${patientId}/laboratorios`);
}

const CHART = ["glucosa", "hba1c", "colesterol", "ldl", "hdl", "trigliceridos"];

export default async function Labs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("lab_results").select("id, taken_on, values, notes").eq("patient_id", id).order("taken_on", { ascending: false });
  const rows = (data ?? []) as { id: string; taken_on: string; values: Record<string, number>; notes: string | null }[];
  const used = LABS.filter((l) => rows.some((r) => r.values[l.key] != null));
  const charted = used.filter((l) => CHART.includes(l.key) && rows.filter((r) => r.values[l.key] != null).length >= 2);
  const chart = [...rows].reverse().map((r) => ({ date: fmtDate(r.taken_on, { day: "2-digit", month: "short", year: "2-digit" }), ...Object.fromEntries(charted.map((l) => [l.key, r.values[l.key] ?? null])) }));

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px] xl:items-start">
      <div className="grid gap-4">
        {charted.length > 0 && (
          <Card title="Evolución"><ProgressChart data={chart} series={charted.map((l) => ({ key: l.key, label: `${l.label} (${l.unit})` }))} /></Card>
        )}
        {rows.length > 0 && (
          <Card title={`Últimos resultados · ${fmtDate(rows[0].taken_on)}`}>
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {LABS.filter((l) => rows[0].values[l.key] != null).map((l) => {
                const prev = rows.slice(1).find((r) => r.values[l.key] != null)?.values[l.key];
                const v = rows[0].values[l.key], d = prev != null ? Math.round((v - prev) * 100) / 100 : null;
                return <RangeGauge key={l.key} scale={rangeScale(l.low, l.high, l.unit)} value={v} label={l.label} hint={d == null ? l.note : `${d > 0 ? "+" : ""}${d} ${l.unit} desde el estudio anterior`} />;
              })}
            </div>
          </Card>
        )}
        <Card title="Resultados">
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-2 py-2 font-medium">Analito</th>
                    {rows.map((r) => <th key={r.id} className="px-2 py-2 font-medium whitespace-nowrap">{fmtDate(r.taken_on)}</th>)}
                    <th className="px-2 py-2 font-medium">Referencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {used.map((l) => (
                    <tr key={l.key}>
                      <td className="px-2 py-2 font-medium">{l.label} <span className="text-xs font-normal text-muted">{l.unit}</span></td>
                      {rows.map((r) => {
                        const v = r.values[l.key];
                        const flag = v == null ? null : labFlag(l.key, v);
                        return <td key={r.id} className="px-2 py-2 whitespace-nowrap">{v ?? "—"} {flag && flag !== "normal" && <Badge tone={flag === "alto" ? "danger" : "warn"}>{flag}</Badge>}</td>;
                      })}
                      <td className="px-2 py-2 text-xs text-muted">{[l.low != null && l.high != null ? `${l.low}–${l.high}` : l.high != null ? `≤ ${l.high}` : l.low != null ? `≥ ${l.low}` : "", l.note].filter(Boolean).join(" · ")}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-2 py-2 text-xs text-muted">Notas</td>
                    {rows.map((r) => (
                      <td key={r.id} className="px-2 py-2 align-top text-xs text-muted">
                        {r.notes}
                        <form action={removeLab.bind(null, id, r.id)}><ConfirmButton message="¿Eliminar estos resultados?">Eliminar</ConfirmButton></form>
                      </td>
                    ))}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : <Empty>Sin laboratorios. Captura los primeros resultados.</Empty>}
          <p className="mt-3 text-xs text-muted">Rangos orientativos para adultos (ADA, ATP III, KDIGO). Prevalecen los intervalos del laboratorio y el criterio clínico. El paciente no ve esta sección.</p>
        </Card>
      </div>

      <Card title="Capturar resultados">
        <ActionForm action={addLab.bind(null, id)} resetOnOk className="grid grid-cols-2 gap-3">
          <Field label="Fecha de la muestra" className="col-span-2"><Input type="date" name="taken_on" defaultValue={todayLocal()} max={todayLocal()} required /></Field>
          {LABS.map((l) => <Field key={l.key} label={l.label} hint={l.unit}><Input name={l.key} inputMode="decimal" /></Field>)}
          <Field label="Notas" className="col-span-2"><Textarea name="notes" rows={2} maxLength={2000} /></Field>
          <div className="col-span-2"><SubmitButton>Guardar</SubmitButton></div>
        </ActionForm>
      </Card>
    </div>
  );
}
