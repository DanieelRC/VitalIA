import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { ProgressChart } from "@/components/progress-chart";
import { Badge, Card, Empty, Field, fmtDate, Input, Table, Td, Textarea } from "@/components/ui";
import { evaluationLabels } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/time";
import { deleteMeasurement, saveMeasurement } from "./actions";
import { BIA, CIRC, DIAM, FOLDS } from "./fields";

const label = (k: string) => ({ muneca: "muñeca", triceps: "tríceps", biceps: "bíceps", humero: "húmero", femur: "fémur", suprailiaco: "suprailíaco",
  grasa_pct: "% grasa", musculo_kg: "músculo (kg)", agua_pct: "% agua", visceral: "grasa visceral" } as Record<string, string>)[k] ?? k;

type Row = { id: string; measured_at: string; weight_kg: number | null; height_cm: number | null; circumferences: Record<string, number>; results: Record<string, { value: number | string; label?: string; method?: string }> };

export default async function Antropometria({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("anthropometry").select("*").eq("patient_id", id).order("measured_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  const latest = rows[0];
  const chart = [...rows].reverse().map((r) => ({
    date: fmtDate(r.measured_at, { day: "2-digit", month: "short" }),
    peso: r.weight_kg, grasa: Number(r.results.grasa_pct?.value) || null, cintura: r.circumferences?.cintura ?? null,
  }));

  return (
    <div className="grid gap-4">
      <Card title="Nueva medición">
        <ActionForm action={saveMeasurement.bind(null, id)} resetOnOk className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Fecha"><Input type="date" name="measured_at" defaultValue={todayLocal()} /></Field>
            <Field label="Peso (kg)"><Input name="weight_kg" inputMode="decimal" /></Field>
            <Field label="Talla (cm)"><Input name="height_cm" inputMode="decimal" defaultValue={latest?.height_cm ?? ""} /></Field>
          </div>
          {[["Circunferencias (cm)", "c", CIRC], ["Pliegues cutáneos (mm)", "s", FOLDS], ["Diámetros óseos (cm)", "d", DIAM], ["Bioimpedancia (opcional)", "b", BIA]].map(([t, pre, keys]) => (
            <fieldset key={pre as string}>
              <legend className="mb-2 text-sm font-semibold">{t as string}</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {(keys as string[]).map((k) => <Field key={k} label={label(k)}><Input name={`${pre}_${k}`} inputMode="decimal" /></Field>)}
              </div>
            </fieldset>
          ))}
          <Field label="Observaciones"><Textarea name="notes" rows={2} /></Field>
          <p className="text-xs text-muted">
            El % de grasa se calcula con el mejor método disponible: Slaughter (menores de 18), Jackson-Pollock 7, Durnin-Womersley (bíceps, tríceps,
            subescapular, suprailíaco), Jackson-Pollock 3 o bioimpedancia. La masa muscular (Lee) requiere brazo, muslo y pantorrilla con sus pliegues.
          </p>
          <div><SubmitButton>Guardar y evaluar</SubmitButton></div>
        </ActionForm>
      </Card>

      {latest && (
        <Card title={`Evaluación · ${fmtDate(latest.measured_at)}`}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(latest.results).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-surface-2 p-3">
                <p className="text-xs text-muted">{evaluationLabels[k] ?? k}</p>
                <p className="text-lg font-semibold tabular-nums">{String(v.value)} {v.label && <Badge tone={/riesgo|obesidad|sobrepeso|bajo/i.test(v.label) && !/sin riesgo/i.test(v.label) ? "warn" : "primary"}>{v.label}</Badge>}</p>
                {v.method && <p className="text-xs text-muted">{v.method}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Evolución">
        <ProgressChart data={chart} series={[{ key: "peso", label: "Peso (kg)" }, { key: "grasa", label: "% grasa" }, { key: "cintura", label: "Cintura (cm)" }]} />
      </Card>

      <Card title="Historial">
        {rows.length ? (
          <Table head={["Fecha", "Peso", "IMC", "% grasa", "Cintura", "ICC", ""]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>{fmtDate(r.measured_at)}</Td><Td>{r.weight_kg ?? "—"}</Td><Td>{String(r.results.imc?.value ?? "—")}</Td>
                <Td>{String(r.results.grasa_pct?.value ?? "—")}</Td><Td>{r.circumferences?.cintura ?? "—"}</Td><Td>{String(r.results.icc?.value ?? "—")}</Td>
                <Td><form action={async () => { "use server"; await deleteMeasurement(id, r.id); }}><ConfirmButton message="¿Eliminar medición?">Eliminar</ConfirmButton></form></Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>Sin mediciones.</Empty>}
      </Card>
    </div>
  );
}
