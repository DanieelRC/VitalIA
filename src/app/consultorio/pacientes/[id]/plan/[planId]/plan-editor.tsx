"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input, Select, Textarea, cn } from "@/components/ui";
import {
  activityFactors, adequacy, basalEnergy, describeMacros, energyFormulas, evaluateFormula, mealDistributionPresets, pctOf, rescaleForKcal,
  sumCounts, totalEnergy, totalsFromEquivalents, type EnergyFormula, type Group, type Lock, type MacroState,
} from "@/lib/nutrition";
import type { MealPlan } from "@/lib/data";
import { plateSegments } from "@/lib/groups";
import { Plate } from "@/components/plate";
import { MacroStudio, NumField, type CustomMacroPreset } from "@/components/studio/macro-studio";
import { EquivalentsBoard, type CustomMealPreset, type Meal } from "@/components/studio/equivalents-board";
import { DietCalc } from "@/components/studio/diet-calc";
import { saveMacroPreset, saveMealPreset } from "@/app/consultorio/personalizar/actions";
import { savePlan } from "../actions";

type Person = { sex: "M" | "F"; age: number; weightKg: number; heightCm: number; leanKg?: number; adjustedKg?: number; missing: boolean };
type Recipe = { id: string; name: string; meal_time: string; tags: string[]; kcal: number | null };
export type StudioConfig = {
  macroPresets: CustomMacroPreset[]; mealPresets: CustomMealPreset[];
  formulas: { id: string; name: string; expression: string }[];
  factors: { id: string; kind: "actividad" | "estres"; label: string; value: number }[];
};
const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const n = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));
const STRESS = [{ value: 1, label: "Sin estrés (1.0)" }, { value: 1.1, label: "Leve (1.1)" }, { value: 1.2, label: "Cirugía menor (1.2)" }, { value: 1.35, label: "Trauma (1.35)" }, { value: 1.5, label: "Sepsis (1.5)" }];

export function PlanEditor({ patientId, planId, initial, person, groups, recipes, pathologies, config }: {
  patientId: string; planId: string | null; initial: MealPlan | null; person: Person; groups: Group[]; recipes: Recipe[]; pathologies: string[]; config: StudioConfig;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "danger" | "primary"; text: string } | null>(null);

  // ---- Energía ----
  const e = initial?.energy ?? {};
  const [formula, setFormula] = useState(String(e.formula ?? "mifflin"));
  const [weight, setWeight] = useState(String(e.weight ?? person.weightKg));
  const [height, setHeight] = useState(String(e.height ?? person.heightCm));
  const [age, setAge] = useState(String(e.age ?? person.age));
  const [lean, setLean] = useState(String(e.lean || person.leanKg || ""));
  const [activity, setActivity] = useState(Number(e.activity ?? 1.375));
  const [stress, setStress] = useState(Number(e.stress ?? 1));
  const [eta, setEta] = useState(Number(e.eta_pct ?? 10));
  const [adjust, setAdjust] = useState(String(e.adjustment ?? 0));
  const [manualKcal, setManualKcal] = useState(e.manual ? String(initial?.kcal_target) : "");

  const input = { weightKg: n(weight), heightCm: n(height), age: n(age), sex: person.sex, leanKg: n(lean) || undefined };
  const allGeb = [
    ...Object.keys(energyFormulas).map((k) => ({ key: k, label: energyFormulas[k as EnergyFormula].label, custom: false, v: basalEnergy(k as EnergyFormula, input) })),
    ...config.formulas.map((f) => {
      let v = NaN;
      try { v = Math.round(evaluateFormula(f.expression, { peso: input.weightKg, talla: input.heightCm, edad: input.age, mlg: input.leanKg, hombre: person.sex === "M" ? 1 : 0, mujer: person.sex === "F" ? 1 : 0 })); } catch { /* falta un dato */ }
      return { key: `custom:${f.id}`, label: f.name, custom: true, v };
    }),
  ];
  const chosen = allGeb.find((f) => f.key === formula) ?? allGeb[1];
  const geb = chosen.v;
  const toGet = (g: number) => totalEnergy({ geb: g, activity, stress, etaPct: eta, adjustment: n(adjust) });
  const get = Number.isFinite(geb) ? toGet(geb) : 0;
  const kcal = manualKcal ? n(manualKcal) : get;
  const maxGeb = Math.max(...allGeb.map((f) => (Number.isFinite(f.v) ? f.v : 0)), 1);
  const actOptions = [...activityFactors, ...config.factors.filter((f) => f.kind === "actividad").map((f) => ({ value: Number(f.value), label: `${f.label} (${Number(f.value)})` }))];
  const stressOptions = [...STRESS, ...config.factors.filter((f) => f.kind === "estres").map((f) => ({ value: Number(f.value), label: `${f.label} (${Number(f.value)})` }))];

  // ---- Macros (deslizadores con candados) ----
  const [ms, setMs] = useState<MacroState>(() => {
    const m0 = initial?.macros, k = Number(initial?.kcal_target) || 0;
    const fromG = m0 && k ? { protein: pctOf("protein", m0.protein_g, k), fat: pctOf("fat", m0.fat_g, k), carbs: pctOf("carbs", m0.carbs_g, k) } : null;
    const pct = m0?.mode === "gkg" && fromG ? fromG : { protein: m0?.protein_pct ?? fromG?.protein ?? 20, fat: m0?.fat_pct ?? fromG?.fat ?? 30, carbs: m0?.carbs_pct ?? fromG?.carbs ?? 50 };
    const r = (v: number) => Math.round(v * 10) / 10;
    const l = (m0?.locks ?? {}) as Partial<Record<"protein" | "fat" | "carbs", Lock>>;
    return { pct: { protein: r(pct.protein), fat: r(pct.fat), carbs: r(pct.carbs) }, locks: { protein: l.protein ?? null, fat: l.fat ?? null, carbs: l.carbs ?? null } };
  });
  // Si cambia la energía, los macros fijados en gramos conservan sus gramos y el resto se reacomoda
  const [prevKcal, setPrevKcal] = useState(kcal);
  if (prevKcal !== kcal) {
    setPrevKcal(kcal);
    if (kcal > 0 && prevKcal > 0) setMs(rescaleForKcal(ms, prevKcal, kcal));
  }
  const md = describeMacros(ms, kcal, n(weight));
  const macros = { protein_g: md.rows[0].g, fat_g: md.rows[1].g, carbs_g: md.rows[2].g };

  // ---- Tiempos y equivalentes ----
  const [meals, setMeals] = useState<Meal[]>(initial?.meals ?? mealDistributionPresets[2].meals.map((m) => ({ ...m, equivalents: {} })));
  const daily = useMemo(() => sumCounts(meals.map((m) => m.equivalents)), [meals]);
  const totals = totalsFromEquivalents(daily, groups);
  const kcalAdq = adequacy(totals.kcal, kcal);

  const [eqView, setEqView] = useState<"dia" | "tiempos">("dia");

  // ---- Menú ----
  const [menu, setMenu] = useState(initial?.menu ?? []);
  const [day, setDay] = useState(1);
  const menuCell = (d: number, mi: number) => menu.find((x) => x.day === d && x.meal === mi);
  const setMenuCell = (d: number, mi: number, patch: { recipe_id?: string | null; text?: string }) =>
    setMenu((list) => {
      const rest = list.filter((x) => !(x.day === d && x.meal === mi));
      const cur = { ...(list.find((x) => x.day === d && x.meal === mi) ?? { day: d, meal: mi }), ...patch };
      return cur.recipe_id || cur.text ? [...rest, cur] : rest;
    });
  const tagFilter = pathologies.map((p) => p.toLowerCase());
  const recipeOptions = [...recipes].sort((a, b) =>
    Number(b.tags.some((t) => tagFilter.some((p) => p.includes(t)))) - Number(a.tags.some((t) => tagFilter.some((p) => p.includes(t)))));

  // ---- Generales ----
  const [name, setName] = useState(initial?.name ?? "Plan de alimentación");
  const [status, setStatus] = useState(initial?.status ?? "borrador");
  const [startDate, setStartDate] = useState(initial?.start_date ?? new Date().toISOString().slice(0, 10));
  const [recs, setRecs] = useState(initial?.recommendations ?? "");

  const save = () => {
    setMsg(null);
    if (!md.balanced) { setMsg({ tone: "danger", text: `Los macronutrientes suman ${md.sum} %. Ajusta la distribución para que sume 100 % antes de guardar.` }); return; }
    start(async () => {
      const res = await savePlan(patientId, planId, {
        name, status, start_date: startDate || null,
        energy: { formula, formula_label: chosen.label, weight: n(weight), height: n(height), age: n(age), lean: n(lean), activity, stress, eta_pct: eta, adjustment: n(adjust), geb: Number.isFinite(geb) ? geb : 0, get, manual: manualKcal ? 1 : 0 },
        kcal_target: Math.round(kcal),
        macros: { mode: "porcentaje", protein_pct: ms.pct.protein, fat_pct: ms.pct.fat, carbs_pct: ms.pct.carbs, protein_gkg: md.rows[0].gkg, fat_gkg: md.rows[1].gkg, ...macros, locks: ms.locks },
        meals: meals.map((m) => ({ ...m, equivalents: Object.fromEntries(Object.entries(m.equivalents).filter(([, v]) => v > 0)) })),
        menu: menu.filter((x) => x.meal < meals.length), recommendations: recs || null,
      });
      if ("error" in res && res.error) setMsg({ tone: "danger", text: res.error });
      else if ("id" in res) {
        setMsg({ tone: "primary", text: "Plan guardado." });
        if (!planId) router.replace(`/consultorio/pacientes/${patientId}/plan/${res.id}`);
        else router.refresh();
      }
    });
  };
  const savePreset = (fn: () => Promise<{ ok: true } | { error: string }>, okText: string) =>
    start(async () => { const r = await fn(); setMsg("error" in r ? { tone: "danger", text: r.error } : { tone: "primary", text: okText }); if (!("error" in r)) router.refresh(); });

  return (
    <div className="grid gap-4 pb-24">
      {person.missing && <Alert tone="warn">Faltan sexo, fecha de nacimiento o una medición de peso: se usan valores por defecto. Revísalos.</Alert>}

      <Card title={<Step n={1}>Requerimiento energético</Step>}>
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="grid h-fit grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Peso (kg)" hint={person.adjustedKg ? `Ajustado: ${person.adjustedKg}` : undefined}><Input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Talla (cm)"><Input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Edad"><Input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" /></Field>
            <Field label="Masa libre de grasa (kg)"><Input value={lean} onChange={(e) => setLean(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Actividad física" className="col-span-2">
              <div className="flex gap-1.5">
                <Select value={actOptions.some((a) => a.value === activity) ? activity : ""} onChange={(e) => e.target.value && setActivity(Number(e.target.value))}>
                  {!actOptions.some((a) => a.value === activity) && <option value="">Personalizado</option>}
                  {actOptions.map((a, i) => <option key={i} value={a.value}>{a.label}</option>)}
                </Select>
                <NumField label="Factor de actividad" value={activity} step={0.05} min={1} max={2.5} onCommit={setActivity} className="w-24 shrink-0 [&_input]:h-10" />
              </div>
            </Field>
            <Field label="Factor de estrés" className="col-span-2">
              <div className="flex gap-1.5">
                <Select value={stressOptions.some((a) => a.value === stress) ? stress : ""} onChange={(e) => e.target.value && setStress(Number(e.target.value))}>
                  {!stressOptions.some((a) => a.value === stress) && <option value="">Personalizado</option>}
                  {stressOptions.map((a, i) => <option key={i} value={a.value}>{a.label}</option>)}
                </Select>
                <NumField label="Factor de estrés" value={stress} step={0.05} min={0.5} max={3} onCommit={setStress} className="w-24 shrink-0 [&_input]:h-10" />
              </div>
            </Field>
            <Field label="ETA (% del GEB)"><NumField label="Efecto térmico de los alimentos" value={eta} step={1} max={20} suffix="%" onCommit={setEta} className="[&_input]:h-10" /></Field>
            <Field label="Ajuste (kcal)" hint="−500 déficit · +300 superávit"><Input value={adjust} onChange={(e) => setAdjust(e.target.value)} inputMode="numeric" /></Field>
            <Field label="Energía manual (kcal)" hint="Sustituye el cálculo" className="col-span-2"><Input value={manualKcal} onChange={(e) => setManualKcal(e.target.value)} inputMode="numeric" placeholder="Opcional" /></Field>
          </div>

          <div>
            <div className="rounded-2xl bg-field p-4 text-field-fg">
              <p className="text-xs text-field-muted">{manualKcal ? "Energía manual" : chosen.label}</p>
              <p className="tabular font-display text-4xl font-extrabold tracking-tight">{Math.round(kcal)} <span className="text-base font-semibold text-field-muted">kcal/día</span></p>
              {!manualKcal && <p className="formula mt-2 text-[13px] text-field-muted">GET = {Number.isFinite(geb) ? geb : "—"} × {activity} × {stress} + {eta} % GEB {n(adjust) ? `${n(adjust) > 0 ? "+" : "−"} ${Math.abs(n(adjust))}` : ""}</p>}
              <p className="tabular mt-1 text-xs text-field-muted">{n(weight) > 0 ? `${(kcal / n(weight)).toFixed(1)} kcal/kg` : ""}</p>
            </div>
            <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Comparar fórmulas (GEB → GET)</p>
            <div role="radiogroup" aria-label="Fórmula de gasto energético" className="grid gap-1">
              {allGeb.map((f) => {
                const ok = Number.isFinite(f.v), on = f.key === chosen.key;
                return (
                  <button key={f.key} type="button" role="radio" aria-checked={on} disabled={!ok} onClick={() => setFormula(f.key)}
                    className={cn("relative overflow-hidden rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors", on ? "border-primary bg-primary-soft" : "border-transparent hover:bg-surface-2", !ok && "opacity-50")}>
                    <span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: ok ? `${(f.v / maxGeb) * 100}%` : 0 }} aria-hidden />
                    <span className="relative flex items-baseline justify-between gap-2">
                      <span className={cn(on && "font-semibold text-primary")}>{f.label}{f.custom && <span className="ml-1 rounded bg-surface px-1 text-[10px] text-muted">propia</span>}</span>
                      <span className="tabular shrink-0">{ok ? <>{f.v} <span className="text-muted">→ {toGet(f.v)}</span></> : "requiere MLG"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card title={<Step n={2}>Distribución de macronutrientes</Step>}>
        <MacroStudio kcal={kcal} weightKg={n(weight)} value={ms} onChange={setMs} customPresets={config.macroPresets}
          onSavePreset={(pname) => savePreset(() => saveMacroPreset({ name: pname, protein_pct: ms.pct.protein, fat_pct: ms.pct.fat, carbs_pct: ms.pct.carbs }), "Distribución guardada en tus distribuciones.")} />
      </Card>

      <Card title={<Step n={3}>Tiempos de comida y equivalentes</Step>}>
        <div className="mb-4 inline-flex rounded-full border border-border bg-surface-2 p-0.5" role="tablist" aria-label="Vista de equivalentes">
          {([["dia", "Dietocálculo · por día"], ["tiempos", "Distribución · por tiempos"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={eqView === k} onClick={() => setEqView(k)}
              className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition-colors", eqView === k ? "bg-field text-field-fg shadow-soft" : "text-muted hover:text-text")}>{l}</button>
          ))}
        </div>
        {eqView === "dia" ? <div className="animate-enter"><DietCalc groups={groups} meals={meals} onMeals={setMeals} kcal={kcal} macros={macros} /></div> : <div className="animate-enter"><EquivalentsBoard groups={groups} meals={meals} onMeals={setMeals} kcal={kcal} macros={macros} customPresets={config.mealPresets}
          onSavePreset={(pname) => savePreset(() => saveMealPreset({ name: pname, meals: meals.map(({ name: mn, kcal_pct }) => ({ name: mn, kcal_pct })) }), "Tiempos guardados en tus distribuciones.")} /></div>}
      </Card>

      <Card title={<Step n={4}>Menú semanal <span className="text-sm font-normal text-muted">(opcional)</span></Step>}>
        <div className="mb-3 flex flex-wrap gap-1">
          {DAYS.map((d, i) => (
            <Button key={d} size="sm" variant={day === i + 1 ? "primary" : "secondary"} onClick={() => setDay(i + 1)}>
              {d} {menu.some((x) => x.day === i + 1) && "•"}
            </Button>
          ))}
        </div>
        <div className="grid gap-3">
          {meals.map((m, mi) => {
            const cell = menuCell(day, mi);
            return (
              <div key={mi} className="grid gap-2 sm:grid-cols-[160px_1fr_1fr] sm:items-center">
                <p className="text-sm font-medium">{m.name}</p>
                <Select value={cell?.recipe_id ?? ""} onChange={(e) => setMenuCell(day, mi, { recipe_id: e.target.value || null })}>
                  <option value="">— Receta —</option>
                  {recipeOptions.map((r) => <option key={r.id} value={r.id}>{r.name}{r.kcal ? ` · ${r.kcal} kcal` : ""}</option>)}
                </Select>
                <Input placeholder="o descripción libre" value={cell?.text ?? ""} onChange={(e) => setMenuCell(day, mi, { text: e.target.value })} />
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => setMenu((list) => [...list.filter((x) => x.day === 1), ...[2, 3, 4, 5, 6, 7].flatMap((d) => list.filter((x) => x.day === 1).map((x) => ({ ...x, day: d })))])}>
            Copiar el lunes a toda la semana
          </Button>
        </div>
      </Card>

      <Card title={<Step n={5}>Recomendaciones y estado</Step>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nombre del plan"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Inicio"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="Estado" hint="Solo el plan activo es visible para el paciente">
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="borrador">Borrador</option><option value="activo">Activo</option><option value="archivado">Archivado</option>
            </Select>
          </Field>
          <Field label="Recomendaciones para el paciente" className="sm:col-span-3">
            <Textarea value={recs} onChange={(e) => setRecs(e.target.value)} rows={4} />
          </Field>
        </div>
      </Card>

      {/* Resumen fijo: siempre a la vista mientras se ajusta */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
          <Plate segments={plateSegments(daily)} size={40} animate={false} label="Equivalentes del día por grupo" />
          <p className="tabular font-display text-xl font-extrabold">{Math.round(kcal)} <span className="text-xs font-semibold text-muted">kcal</span></p>
          <p className="tabular text-sm"><span className="text-muted">P</span> <b>{macros.protein_g}</b> · <span className="text-muted">L</span> <b>{macros.fat_g}</b> · <span className="text-muted">HC</span> <b>{macros.carbs_g}</b> <span className="text-xs text-muted">g</span></p>
          <p className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", !md.balanced ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>Macros {md.sum} %</p>
          <p className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", totals.kcal === 0 ? "bg-surface-2 text-muted" : kcalAdq.ok ? "bg-primary-soft text-primary" : "bg-warn-soft text-warn")}>
            {totals.kcal === 0 ? "Sin equivalentes" : `Adecuación ${kcalAdq.pct} %`}
          </p>
          {msg && <p className={cn("text-sm font-medium", msg.tone === "danger" ? "text-danger" : "text-primary")} role="status">{msg.text}</p>}
          <div className="ml-auto flex gap-2">
            {planId && <a className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-semibold hover:bg-surface-2" href={`/api/pdf/plan/${planId}`} target="_blank">PDF</a>}
            <Button onClick={save} disabled={pending}>{pending ? "Guardando…" : "Guardar plan"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n: num, children }: { n: number; children: React.ReactNode }) {
  return <span className="flex items-center gap-2.5"><span className="grid size-7 place-items-center rounded-full bg-primary font-display text-sm font-bold text-primary-fg">{num}</span>{children}</span>;
}
