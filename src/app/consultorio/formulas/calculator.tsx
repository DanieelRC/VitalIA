"use client";
import { useState, type ReactNode } from "react";
import { Card, Field, Select, cn } from "@/components/ui";
import {
  activityFactors, adjustedWeight, athleteTargets, ATHLETE_GOALS, basalEnergy, bmi, BMI_SCALE, bodyComposition, bodyFatScale, brozek,
  durninWomersleyDensity, energyFormulas, evaluateFormula, heartRateZones, idealWeight, jacksonPollock3Density, maxHeartRate, metKcal,
  oneRepMaxBrzycki, oneRepMaxEpley, pregnancyPlan, PREGNANCY_GAIN, siri, somatotype, totalEnergy, TRAINING_LOADS, waistHeightRatio,
  waistHipRatio, waistScale, waterNeeds, whrScale, WHTR_SCALE, type AthleteGoal, type EnergyFormula, type MacroState, type Sex, type TrainingLoad,
} from "@/lib/nutrition";
import { Formula, FormulaCard, Frac } from "@/components/formula";
import { MacroStudio, NumField, type CustomMacroPreset } from "@/components/studio/macro-studio";

const TABS = [
  { key: "cuerpo", label: "Composición corporal" }, { key: "energia", label: "Energía" }, { key: "macros", label: "Macronutrientes" },
  { key: "ejercicio", label: "Ejercicio" }, { key: "somatotipo", label: "Somatotipo" }, { key: "embarazo", label: "Embarazo" }, { key: "deporte", label: "Deporte" },
] as const;
type Tab = (typeof TABS)[number]["key"];
export type CalcConfig = {
  formulas: { id: string; name: string; expression: string }[];
  factors: { id: string; kind: "actividad" | "estres"; label: string; value: number }[];
  macroPresets: CustomMacroPreset[];
};
const ZONE_COLORS = ["var(--g-leche)", "var(--g-verduras)", "var(--g-frutas)", "var(--g-cereales)", "var(--g-aoa)"];
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Campo numérico con etiqueta y unidad; 0 significa "sin dato". */
function Num({ label, value, onChange, unit, step = 1, max, className }: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number; max?: number; className?: string }) {
  return <Field label={label} className={className}><NumField label={label} value={value} onCommit={onChange} step={step} max={max} suffix={unit} className="[&_input]:h-10" /></Field>;
}

export function Calculator({ config }: { config: CalcConfig }) {
  const [tab, setTab] = useState<Tab>("cuerpo");
  // Datos base, compartidos por todas las pestañas
  const [sex, setSex] = useState<Sex>("F");
  const [w, setW] = useState(70); const [h, setH] = useState(165); const [age, setAge] = useState(30);
  // Composición corporal
  const [waist, setWaist] = useState(0); const [hip, setHip] = useState(0);
  const [f, setF] = useState({ biceps: 0, triceps: 0, subescapular: 0, suprailiaco: 0, pecho: 0, abdominal: 0, muslo: 0 });
  // Energía
  const [lean, setLean] = useState(0); const [fa, setFa] = useState(1.375); const [fe, setFe] = useState(1); const [eta, setEta] = useState(10);
  // Macros
  const [kcal, setKcal] = useState(1800);
  const [ms, setMs] = useState<MacroState>({ pct: { protein: 20, fat: 30, carbs: 50 }, locks: { protein: null, fat: null, carbs: null } });
  // Ejercicio
  const [rest, setRest] = useState(65); const [met, setMet] = useState(5); const [min, setMin] = useState(30); const [rmW, setRmW] = useState(60); const [rmR, setRmR] = useState(8);
  // Somatotipo
  const [so, setSo] = useState({ triceps: 0, subscapular: 0, supraspinale: 0, calfSkinfold: 0, humerus: 0, femur: 0, armFlexed: 0, calf: 0 });
  // Embarazo
  const [preW, setPreW] = useState(60); const [week, setWeek] = useState(20); const [nowW, setNowW] = useState(0);
  // Deporte
  const [load, setLoad] = useState<TrainingLoad>("moderado"); const [goal, setGoal] = useState<AthleteGoal>("mantener");

  const ok = w > 0 && h > 0;
  const m2 = (h / 100) ** 2;

  return (
    <div className="grid gap-4">
      {/* Datos base: siempre visibles */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur sm:top-2 sm:mx-0 sm:rounded-2xl sm:border sm:bg-surface/95 sm:shadow-soft">
        <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[auto_repeat(3,minmax(0,1fr))]">
          <Field label="Sexo">
            <div className="flex h-10 rounded-xl border border-border bg-surface p-0.5" role="radiogroup" aria-label="Sexo">
              {(["F", "M"] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={sex === s} onClick={() => setSex(s)}
                  className={cn("rounded-[10px] px-3 text-sm font-semibold transition-colors", sex === s ? "bg-field text-field-fg" : "text-muted hover:text-text")}>{s === "F" ? "Mujer" : "Hombre"}</button>
              ))}
            </div>
          </Field>
          <Num label="Peso" unit="kg" value={w} onChange={setW} step={0.5} max={400} />
          <Num label="Talla" unit="cm" value={h} onChange={setH} step={0.5} max={250} />
          <Num label="Edad" unit="años" value={age} onChange={setAge} max={120} />
        </div>
      </div>

      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="Tipo de cálculo">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-current={tab === t.key ? "page" : undefined}
            className={cn("whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors", tab === t.key ? "bg-text font-semibold text-bg" : "text-muted hover:bg-surface-2 hover:text-text")}>{t.label}</button>
        ))}
      </nav>

      {tab === "cuerpo" && (() => {
        const imc = ok ? bmi(w, h) : null;
        const ideal = h > 0 ? [["Lorentz", idealWeight.lorentz(h, sex)], ["Hamwi", idealWeight.hamwi(h, sex)], ["Robinson", idealWeight.robinson(h, sex)], ["Devine", idealWeight.devine(h, sex)], ["IMC 22", idealWeight.bmiTarget(h)]] as [string, number][] : [];
        const lo = r1(18.5 * m2), hi = r1(24.9 * m2);
        const dw = f.biceps && f.triceps && f.subescapular && f.suprailiaco ? durninWomersleyDensity(f.biceps + f.triceps + f.subescapular + f.suprailiaco, age, sex) : 0;
        const jpKeys = sex === "M" ? (["pecho", "abdominal", "muslo"] as const) : (["triceps", "suprailiaco", "muslo"] as const);
        const jp = jpKeys.every((k) => f[k]) ? jacksonPollock3Density(jpKeys.reduce((a, k) => a + f[k], 0), age, sex) : 0;
        const fat = dw ? siri(dw) : jp ? siri(jp) : null;
        const comp = fat != null && w ? bodyComposition(w, fat) : null;
        const min = Math.min(lo, w, ...ideal.map((x) => x[1])) - 6, max = Math.max(hi, w, ...ideal.map((x) => x[1])) + 6;
        const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
        return (
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormulaCard title="Índice de masa corporal" value={imc} unit="kg/m²" scale={BMI_SCALE}
                formula={<>IMC = <Frac n="peso" d="talla²" /> = <Frac n={w} d={`${(h / 100).toFixed(2)}²`} /> = {imc ?? "—"}</>} />
              <Card title="Peso ideal y peso saludable">
                {ok ? (
                  <>
                    <div className="relative mt-7 h-12" role="img" aria-label={`Peso actual ${w} kg. Peso saludable entre ${lo} y ${hi} kg. ${ideal.map(([n, v]) => `${n} ${v} kg`).join(", ")}`}>
                      <div className="absolute inset-x-0 top-5 h-2 rounded-full bg-surface-2" />
                      <div className="absolute top-5 h-2 rounded-full bg-[var(--g-verduras)] opacity-45" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
                      {ideal.map(([n, v]) => <span key={n} title={`${n}: ${v} kg`} className="absolute top-[14px] size-4 -translate-x-1/2 rounded-full border-2 border-surface bg-primary" style={{ left: pos(v) }} />)}
                      <span className="absolute -top-6 -translate-x-1/2 whitespace-nowrap rounded-full bg-text px-2 py-0.5 text-[11px] font-bold text-bg" style={{ left: pos(w) }}>{w} kg</span>
                      <span className="absolute top-1 h-8 w-0.5 -translate-x-1/2 bg-text" style={{ left: pos(w) }} />
                      <span className="tabular absolute top-9 -translate-x-1/2 text-[10px] text-muted" style={{ left: pos(lo) }}>{lo}</span>
                      <span className="tabular absolute top-9 -translate-x-1/2 text-[10px] text-muted" style={{ left: pos(hi) }}>{hi}</span>
                    </div>
                    <p className="mb-2 text-xs text-muted">Franja verde: peso para IMC 18.5–24.9. Puntos: peso ideal según cada autor.</p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                      {ideal.map(([n, v]) => <div key={n} className="flex justify-between gap-2"><dt className="text-muted">{n}</dt><dd className="tabular font-semibold">{v} kg</dd></div>)}
                      <div className="flex justify-between gap-2"><dt className="text-muted">Ajustado</dt><dd className="tabular font-semibold">{adjustedWeight(w, ideal[0][1])} kg</dd></div>
                    </dl>
                    <Formula className="mt-3 text-[13px]">Peso ajustado = PI + 0.25 × (PA − PI)</Formula>
                  </>
                ) : <p className="text-sm text-muted">Escribe peso y talla.</p>}
              </Card>
            </div>

            <Card title="Circunferencias y riesgo cardiometabólico">
              <div className="grid grid-cols-2 gap-3 sm:max-w-sm"><Num label="Cintura" unit="cm" value={waist} onChange={setWaist} step={0.5} max={250} /><Num label="Cadera" unit="cm" value={hip} onChange={setHip} step={0.5} max={250} /></div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <FormulaCard title="Circunferencia de cintura" value={waist || null} unit="cm" scale={waistScale(sex)} hint={`Riesgo desde ${sex === "M" ? 90 : 80} cm (IDF, población latina).`} />
                <FormulaCard title="Índice cintura-estatura" value={waist && h ? waistHeightRatio(waist, h) : null} scale={WHTR_SCALE} formula={<>ICE = <Frac n="cintura" d="talla" /></>} />
                <FormulaCard title="Índice cintura-cadera" value={waist && hip ? waistHipRatio(waist, hip) : null} scale={whrScale(sex)} formula={<>ICC = <Frac n="cintura" d="cadera" /></>} />
              </div>
            </Card>

            <Card title="Grasa corporal por pliegues cutáneos">
              <p className="mb-3 text-sm text-muted">Pliegues en milímetros. Durnin-Womersley usa los cuatro primeros; Jackson-Pollock 3 usa {jpKeys.join(", ")}.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {(Object.keys(f) as (keyof typeof f)[]).map((k) => <Num key={k} label={k[0].toUpperCase() + k.slice(1)} unit="mm" value={f[k]} step={0.5} max={80} onChange={(v) => setF({ ...f, [k]: v })} />)}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <FormulaCard title="% de grasa · Durnin-Womersley" tag="Siri" value={dw ? siri(dw) : null} unit="%" scale={bodyFatScale(sex)}
                  formula={<>D = c − m · log₁₀(Σ4){dw ? <> = {dw.toFixed(4)}</> : null} &nbsp;→&nbsp; %G = (<Frac n="4.95" d="D" /> − 4.50) × 100</>}
                  hint={dw ? `Brozek: ${brozek(dw)} %` : "Captura bíceps, tríceps, subescapular y suprailiaco."} />
                <FormulaCard title="% de grasa · Jackson-Pollock 3" tag="Siri" value={jp ? siri(jp) : null} unit="%" scale={bodyFatScale(sex)}
                  formula={<>D = f(Σ3, edad){jp ? <> = {jp.toFixed(4)}</> : null} &nbsp;→&nbsp; %G = (<Frac n="4.95" d="D" /> − 4.50) × 100</>}
                  hint={jp ? undefined : `Captura ${jpKeys.join(", ")}.`} />
              </div>
              {comp && <p className="tabular mt-3 text-sm">Con {fat} % de grasa: masa grasa <b>{comp.fatKg} kg</b> · masa libre de grasa <b>{comp.leanKg} kg</b>.</p>}
            </Card>
          </div>
        );
      })()}

      {tab === "energia" && (() => {
        const input = { weightKg: w, heightCm: h, age, sex, leanKg: lean || undefined };
        const list = [
          ...Object.keys(energyFormulas).map((k) => ({ key: k, label: energyFormulas[k as EnergyFormula].label, custom: false, v: basalEnergy(k as EnergyFormula, input) })),
          ...config.formulas.map((c) => { let v = NaN; try { v = Math.round(evaluateFormula(c.expression, { peso: w, talla: h, edad: age, mlg: lean || undefined, hombre: sex === "M" ? 1 : 0, mujer: sex === "F" ? 1 : 0 })); } catch { /* falta un dato */ } return { key: c.id, label: c.name, custom: true, v }; }),
        ];
        const valid = list.filter((x) => Number.isFinite(x.v));
        const maxV = Math.max(...valid.map((x) => toGet(x.v)), 1);
        function toGet(g: number) { return totalEnergy({ geb: g, activity: fa, stress: fe, etaPct: eta }); }
        const avg = valid.length ? Math.round(valid.reduce((a, x) => a + x.v, 0) / valid.length) : 0;
        const acts = [...activityFactors, ...config.factors.filter((x) => x.kind === "actividad").map((x) => ({ value: Number(x.value), label: `${x.label} (${Number(x.value)})` }))];
        return (
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card title="Factores">
              <div className="grid gap-3">
                <Field label="Actividad física">
                  <Select value={acts.some((a) => a.value === fa) ? fa : ""} onChange={(e) => e.target.value && setFa(Number(e.target.value))}>
                    {!acts.some((a) => a.value === fa) && <option value="">Personalizado ({fa})</option>}
                    {acts.map((a, i) => <option key={i} value={a.value}>{a.label}</option>)}
                  </Select>
                </Field>
                <input type="range" min={1} max={2.4} step={0.025} value={fa} onChange={(e) => setFa(Number(e.target.value))} aria-label="Factor de actividad" className="macro-slider h-7" style={{ ["--c" as string]: "var(--primary)", background: "linear-gradient(var(--surface-2),var(--surface-2)) center/100% 8px no-repeat", borderRadius: 999 }} />
                <div className="grid grid-cols-2 gap-3">
                  <Num label="Factor de estrés" value={fe} onChange={setFe} step={0.05} max={3} />
                  <Num label="ETA" unit="%" value={eta} onChange={setEta} max={20} />
                </div>
                <Num label="Masa libre de grasa" unit="kg" value={lean} onChange={setLean} step={0.5} max={200} />
                <Formula className="text-[13px]">GET = GEB × FA × FE + <Frac n="ETA" d="100" /> × GEB</Formula>
                <Formula className="text-[13px]">GET = GEB × {fa} × {fe} + {eta / 100} × GEB</Formula>
              </div>
            </Card>
            <Card title="Comparación de fórmulas">
              <ul className="grid gap-2">
                {list.map((x) => {
                  const fin = Number.isFinite(x.v), get = fin ? toGet(x.v) : 0;
                  return (
                    <li key={x.key} className={cn("grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3 text-sm", !fin && "opacity-50")}>
                      <span className="truncate">{x.label}{x.custom && <span className="ml-1 rounded bg-info-soft px-1 text-[10px] font-semibold text-info">propia</span>}</span>
                      <span className="relative h-6 overflow-hidden rounded-md bg-surface-2" aria-hidden>
                        <span className="absolute inset-y-0 left-0 rounded-md bg-primary/25" style={{ width: `${(get / maxV) * 100}%` }} />
                        <span className="absolute inset-y-0 left-0 rounded-md bg-primary" style={{ width: `${((fin ? x.v : 0) / maxV) * 100}%` }} />
                      </span>
                      <span className="tabular w-36 text-right">{fin ? <><b>{x.v}</b> <span className="text-muted">→ {get} kcal</span></> : <span className="text-muted">requiere MLG</span>}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-primary" />GEB (basal)</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-primary/25" />GET (total)</span>
                {valid.length > 1 && <span className="tabular">Promedio GEB {avg} kcal · diferencia entre fórmulas {Math.max(...valid.map((x) => x.v)) - Math.min(...valid.map((x) => x.v))} kcal</span>}
              </p>
            </Card>
          </div>
        );
      })()}

      {tab === "macros" && (
        <Card title="Distribución de macronutrientes">
          <div className="mb-4 max-w-40"><Num label="Energía" unit="kcal" value={kcal} onChange={setKcal} step={50} max={8000} /></div>
          <MacroStudio kcal={kcal} weightKg={w} value={ms} onChange={setMs} customPresets={config.macroPresets} />
        </Card>
      )}

      {tab === "ejercicio" && (() => {
        const fcmax = maxHeartRate.tanaka(age), zones = heartRateZones(fcmax, rest);
        const span = fcmax - rest || 1;
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Zonas de entrenamiento (Karvonen)" className="lg:col-span-2">
              <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-start">
                <div className="grid gap-3">
                  <Num label="FC en reposo" unit="lpm" value={rest} onChange={setRest} max={130} />
                  <p className="tabular text-sm">FC máxima <b>{fcmax} lpm</b><span className="block text-xs text-muted">220 − edad: {maxHeartRate.fox(age)} lpm</span></p>
                </div>
                <div>
                  <div className="flex h-12 overflow-hidden rounded-xl" role="img" aria-label={zones.map((z) => `Zona ${z.zone} ${z.label}: ${z.minHr} a ${z.maxHr} latidos`).join(". ")}>
                    <div className="grid place-items-center bg-surface-2 text-[10px] text-muted" style={{ width: `${((zones[0].minHr - rest) / span) * 100}%` }}>reposo</div>
                    {zones.map((z, i) => (
                      <div key={z.zone} className="grid place-items-center text-xs font-bold text-white" style={{ width: `${((z.maxHr - z.minHr) / span) * 100}%`, background: ZONE_COLORS[i] }}>Z{z.zone}</div>
                    ))}
                  </div>
                  <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
                    {zones.map((z, i) => (
                      <li key={z.zone} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5">
                        <span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: ZONE_COLORS[i] }} />Z{z.zone} · {z.label} <span className="text-xs text-muted">{z.from}–{z.to} %</span></span>
                        <b className="tabular">{z.minHr}–{z.maxHr}</b>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Formula className="text-[13px]">FC<sub>máx</sub> = 208 − 0.7 × edad = {fcmax}</Formula>
                    <Formula className="text-[13px]">FC<sub>obj</sub> = FC<sub>rep</sub> + % × (FC<sub>máx</sub> − FC<sub>rep</sub>)</Formula>
                  </div>
                </div>
              </div>
            </Card>
            <Card title="Gasto de una sesión">
              <div className="grid grid-cols-2 gap-3"><Num label="Intensidad" unit="MET" value={met} onChange={setMet} step={0.5} max={25} /><Num label="Duración" unit="min" value={min} onChange={setMin} step={5} max={600} /></div>
              <p className="tabular mt-3 font-display text-3xl font-extrabold">{metKcal(met, w, min)} <span className="text-sm font-semibold text-muted">kcal</span></p>
              <Formula className="mt-2 text-[13px]">kcal = <Frac n={`MET × 3.5 × peso`} d="200" /> × min = <Frac n={`${met} × 3.5 × ${w}`} d="200" /> × {min}</Formula>
              <p className="mt-2 text-xs text-muted">Referencia: caminar 3.5 · trotar 7 · correr 10 · bici moderada 6 · pesas 3.5–6 · nadar 6–8 MET.</p>
            </Card>
            <Card title="Fuerza máxima estimada (1RM)">
              <div className="grid grid-cols-2 gap-3"><Num label="Carga" unit="kg" value={rmW} onChange={setRmW} step={2.5} max={500} /><Num label="Repeticiones" value={rmR} onChange={setRmR} max={20} /></div>
              <p className="tabular mt-3 font-display text-3xl font-extrabold">{oneRepMaxEpley(rmW, rmR)} <span className="text-sm font-semibold text-muted">kg · Epley</span></p>
              <p className="tabular text-sm text-muted">Brzycki: {oneRepMaxBrzycki(rmW, rmR)} kg</p>
              <Formula className="mt-2 text-[13px]">1RM = carga × (1 + <Frac n="reps" d="30" />)</Formula>
            </Card>
          </div>
        );
      })()}

      {tab === "somatotipo" && (() => {
        const ready = ok && Object.values(so).every((v) => v > 0);
        const s = ready ? somatotype({ heightCm: h, weightKg: w, ...so }) : null;
        const labels: [keyof typeof so, string, string][] = [["triceps", "Pliegue tríceps", "mm"], ["subscapular", "Pliegue subescapular", "mm"], ["supraspinale", "Pliegue supraespinal", "mm"], ["calfSkinfold", "Pliegue pantorrilla", "mm"], ["humerus", "Diámetro húmero", "cm"], ["femur", "Diámetro fémur", "cm"], ["armFlexed", "Brazo flexionado", "cm"], ["calf", "Pantorrilla", "cm"]];
        return (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card title="Mediciones (Heath-Carter)">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {labels.map(([k, l, u]) => <Num key={k} label={l} unit={u} value={so[k]} step={0.1} max={90} onChange={(v) => setSo({ ...so, [k]: v })} />)}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {([["Endomorfia", s?.endo, "var(--g-cereales)", "adiposidad relativa"], ["Mesomorfia", s?.meso, "var(--g-aoa)", "robustez músculo-esquelética"], ["Ectomorfia", s?.ecto, "var(--g-leche)", "linealidad relativa"]] as const).map(([n, v, c, d]) => (
                  <div key={n} className="rounded-2xl border border-border p-3">
                    <p className="text-xs text-muted">{n}</p>
                    <p className="tabular font-display text-3xl font-extrabold">{v ?? "—"}</p>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, ((v ?? 0) / 9) * 100)}%`, background: c }} /></div>
                    <p className="mt-1 text-[11px] text-muted">{d}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-2">
                <Formula className="text-[13px]">Endo = −0.7182 + 0.1451X − 0.00068X² + 0.0000014X³, &nbsp; X = Σ3 pliegues × <Frac n="170.18" d="talla" /></Formula>
                <Formula className="text-[13px]">Meso = 0.858·húmero + 0.601·fémur + 0.188·brazo<sub>c</sub> + 0.161·pantorrilla<sub>c</sub> − 0.131·talla + 4.5</Formula>
                <Formula className="text-[13px]">Ecto = 0.732·IP − 28.58 &nbsp;(IP ≥ 40.75), &nbsp; IP = <Frac n="talla" d="∛peso" />{s ? <> = {s.hwr}</> : null}</Formula>
              </div>
            </Card>
            <Card title="Somatocarta">
              <Somatochart point={s ? { x: s.x, y: s.y } : null} />
              <p className="mt-2 text-center font-display text-lg font-bold">{s ? s.label : "Completa las ocho mediciones"}</p>
              {s && <p className="tabular text-center text-sm text-muted">{s.endo} – {s.meso} – {s.ecto} · X {s.x}, Y {s.y}</p>}
            </Card>
          </div>
        );
      })()}

      {tab === "embarazo" && (() => {
        const pre = preW && h ? bmi(preW, h) : 0;
        const g = pre ? pregnancyPlan(pre, preW, week) : null;
        const gain = nowW ? r1(nowW - preW) : null;
        return (
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card title="Datos del embarazo">
              <div className="grid gap-3">
                <Num label="Peso antes del embarazo" unit="kg" value={preW} onChange={setPreW} step={0.5} max={300} />
                <Num label="Semana de gestación" unit="sem" value={week} onChange={(v) => setWeek(Math.min(42, Math.max(1, Math.round(v))))} max={42} />
                <Num label="Peso actual (opcional)" unit="kg" value={nowW} onChange={setNowW} step={0.1} max={300} />
                <p className="text-xs text-muted">La talla se toma de los datos de arriba. Embarazo único (IOM 2009).</p>
              </div>
            </Card>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <FormulaCard title="IMC pregestacional" value={pre || null} unit="kg/m²" hint={g?.category} />
                <FormulaCard title="Ganancia total recomendada" value={g ? `${g.totalGain[0]}–${g.totalGain[1]}` : null} unit="kg" hint={g ? `${g.weeklyGain[0]}–${g.weeklyGain[1]} kg por semana en 2.º y 3.er trimestre` : undefined} />
                <FormulaCard title={`Energía adicional · trimestre ${g?.trimester ?? ""}`} value={g ? `+${g.extraKcal}` : null} unit="kcal/día" hint="0 en el 1.º, +340 en el 2.º, +452 en el 3.º" />
              </div>
              {g && (
                <Card title="Curva de ganancia de peso esperada">
                  <PregnancyChart pre={pre} week={week} gain={gain} />
                  <p className="tabular mt-2 text-sm">
                    Semana {week}: ganancia esperada <b>{g.expectedGainNow[0]}–{g.expectedGainNow[1]} kg</b> (peso {g.expectedWeightNow[0]}–{g.expectedWeightNow[1]} kg).
                    {gain != null && <> Ganancia actual <b className={gain < g.expectedGainNow[0] || gain > g.expectedGainNow[1] ? "text-warn" : "text-primary"}>{gain} kg</b>: {gain < g.expectedGainNow[0] ? "por debajo de lo esperado" : gain > g.expectedGainNow[1] ? "por arriba de lo esperado" : "dentro de lo esperado"}.</>}
                  </p>
                </Card>
              )}
            </div>
          </div>
        );
      })()}

      {tab === "deporte" && (() => {
        const t = athleteTargets(w, load, goal), water = waterNeeds(w);
        const bar = (label: string, r: { gkg: number[]; g: number[] }, max: number, color: string) => (
          <div key={label}>
            <div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-semibold">{label}</span><span className="tabular"><b>{r.g[0]}–{r.g[1]} g</b> <span className="text-muted">· {r.gkg[0]}–{r.gkg[1]} g/kg</span></span></div>
            <div className="relative h-3 rounded-full bg-surface-2" role="img" aria-label={`${label}: ${r.gkg[0]} a ${r.gkg[1]} gramos por kilo`}>
              <div className="absolute inset-y-0 rounded-full transition-all duration-300" style={{ left: `${(r.gkg[0] / max) * 100}%`, width: `${((r.gkg[1] - r.gkg[0]) / max) * 100}%`, background: color }} />
            </div>
          </div>
        );
        return (
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card title="Entrenamiento">
              <div className="grid gap-3">
                <Field label="Carga de entrenamiento"><Select value={load} onChange={(e) => setLoad(e.target.value as TrainingLoad)}>{TRAINING_LOADS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</Select></Field>
                <Field label="Objetivo"><Select value={goal} onChange={(e) => setGoal(e.target.value as AthleteGoal)}>{ATHLETE_GOALS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</Select></Field>
                <p className="text-xs text-muted">Rangos de consenso ISSN / ACSM. Individualiza según deporte, fase de la temporada y tolerancia.</p>
              </div>
            </Card>
            <Card title={`Requerimientos para ${w} kg`}>
              <div className="grid gap-4">
                {bar("Hidratos de carbono", t.carbs, 12, "var(--g-cereales)")}
                {bar("Proteína", t.protein, 12, "var(--g-aoa)")}
                {bar("Lípidos", t.fat, 12, "var(--g-grasas)")}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FormulaCard title="Proteína por comida" value={`${t.proteinPerMeal[0]}–${t.proteinPerMeal[1]}`} unit="g" formula={<>0.25–0.40 g/kg × {w} kg, cada 3–4 h</>} />
                <FormulaCard title="Agua base" value={`${water[0]}–${water[1]}`} unit="ml/día" formula={<>30–35 ml/kg × {w} kg</>} hint="Suma las pérdidas por sudor del entrenamiento." />
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}

/** Somatocarta simplificada: X = ecto − endo, Y = 2·meso − (endo + ecto). */
function Somatochart({ point }: { point: { x: number; y: number } | null }): ReactNode {
  const X = (x: number) => 150 + x * 15, Y = (y: number) => 180 - y * 9;
  const poles = [{ x: 0, y: 12, l: "Mesomorfia", c: "var(--g-aoa)" }, { x: -6, y: -6, l: "Endomorfia", c: "var(--g-cereales)" }, { x: 6, y: -6, l: "Ectomorfia", c: "var(--g-leche)" }];
  return (
    <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[320px]" role="img" aria-label={point ? `Somatocarta: punto en X ${point.x}, Y ${point.y}` : "Somatocarta sin datos"}>
      <path d={`M ${X(0)} ${Y(12)} Q ${X(-5.5)} ${Y(4)} ${X(-6)} ${Y(-6)} Q ${X(0)} ${Y(-8.5)} ${X(6)} ${Y(-6)} Q ${X(5.5)} ${Y(4)} ${X(0)} ${Y(12)} Z`} fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1.5" />
      {poles.map((p) => <line key={p.l} x1={X(0)} y1={Y(0)} x2={X(p.x)} y2={Y(p.y)} stroke="var(--border)" strokeDasharray="3 4" />)}
      {poles.map((p) => (
        <g key={p.l}><circle cx={X(p.x)} cy={Y(p.y)} r="5" fill={p.c} /><text x={X(p.x)} y={Y(p.y) + (p.y > 0 ? -12 : 20)} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--muted)">{p.l}</text></g>
      ))}
      <circle cx={X(0)} cy={Y(0)} r="2.5" fill="var(--muted)" />
      {point && <g style={{ transition: "transform .4s var(--ease-out)" }} transform={`translate(${X(Math.max(-8, Math.min(8, point.x)))} ${Y(Math.max(-10, Math.min(16, point.y)))})`}>
        <circle r="11" fill="var(--primary)" opacity="0.2" /><circle r="6" fill="var(--primary)" stroke="var(--surface)" strokeWidth="2" />
      </g>}
    </svg>
  );
}

/** Franja de ganancia de peso esperada por semana (IOM) y el punto actual. */
function PregnancyChart({ pre, week, gain }: { pre: number; week: number; gain: number | null }): ReactNode {
  const band = PREGNANCY_GAIN.find((b) => pre < b.max)!;
  const at = (wk: number, i: 0 | 1) => (wk <= 13 ? ([0.5, 2][i] * wk) / 13 : [0.5, 2][i] + band.weekly[i] * (wk - 13));
  const maxY = Math.max(at(40, 1), gain ?? 0, 1) * 1.1, minY = Math.min(0, gain ?? 0);
  const X = (wk: number) => 36 + (wk / 40) * 344, Y = (kg: number) => 170 - ((kg - minY) / (maxY - minY)) * 150;
  const weeks = [0, 13, 20, 27, 34, 40];
  const path = `M ${weeks.map((wk) => `${X(wk)} ${Y(at(wk, 1))}`).join(" L ")} L ${[...weeks].reverse().map((wk) => `${X(wk)} ${Y(at(wk, 0))}`).join(" L ")} Z`;
  return (
    <svg viewBox="0 0 400 200" className="w-full" role="img" aria-label={`Ganancia esperada a término: ${band.total[0]} a ${band.total[1]} kg${gain != null ? `. Ganancia actual ${gain} kg en la semana ${week}` : ""}`}>
      {[0, 5, 10, 15, 20].filter((k) => k <= maxY).map((k) => <g key={k}><line x1="36" x2="380" y1={Y(k)} y2={Y(k)} stroke="var(--border)" /><text x="30" y={Y(k) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{k}</text></g>)}
      {[13, 27, 40].map((wk) => <g key={wk}><line x1={X(wk)} x2={X(wk)} y1="20" y2="170" stroke="var(--border)" strokeDasharray="2 4" /><text x={X(wk)} y="184" textAnchor="middle" fontSize="9" fill="var(--muted)">sem {wk}</text></g>)}
      <path d={path} fill="var(--g-verduras)" opacity="0.3" />
      <line x1={X(Math.min(week, 40))} x2={X(Math.min(week, 40))} y1="20" y2="170" stroke="var(--text)" strokeWidth="1" />
      {gain != null && <circle cx={X(Math.min(week, 40))} cy={Y(gain)} r="6" fill="var(--primary)" stroke="var(--surface)" strokeWidth="2" />}
      <text x="36" y="12" fontSize="9" fill="var(--muted)">kg ganados</text>
    </svg>
  );
}
