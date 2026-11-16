"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea, cn } from "@/components/ui";
import {
  activityFactors, adequacy, basalEnergy, energyFormulas, macroPresets, macrosFromGkg, macrosFromPct, mealDistributionPresets,
  pctFromMacros, splitEquivalentsByMeals, suggestDailyEquivalents, sumCounts, totalEnergy, totalsFromEquivalents,
  type EnergyFormula, type Group,
} from "@/lib/nutrition";
import type { MealPlan } from "@/lib/data";
import { savePlan } from "../actions";
import { GroupDot } from "@/components/plate";

type Person = { sex: "M" | "F"; age: number; weightKg: number; heightCm: number; leanKg?: number; adjustedKg?: number; missing: boolean };
type Recipe = { id: string; name: string; meal_time: string; tags: string[]; kcal: number | null };
const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const n = (v: string) => (v === "" ? 0 : Number(v));

export function PlanEditor({ patientId, planId, initial, person, groups, recipes, pathologies }: {
  patientId: string; planId: string | null; initial: MealPlan | null; person: Person; groups: Group[]; recipes: Recipe[]; pathologies: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "danger" | "primary"; text: string } | null>(null);

  // ---- Energía ----
  const e = initial?.energy ?? {};
  const [formula, setFormula] = useState<EnergyFormula>((e.formula as EnergyFormula) ?? "mifflin");
  const [weight, setWeight] = useState(String(e.weight ?? person.weightKg));
  const [height, setHeight] = useState(String(e.height ?? person.heightCm));
  const [age, setAge] = useState(String(e.age ?? person.age));
  const [lean, setLean] = useState(String(e.lean ?? person.leanKg ?? ""));
  const [activity, setActivity] = useState(String(e.activity ?? 1.375));
  const [stress, setStress] = useState(String(e.stress ?? 1));
  const [eta, setEta] = useState(String(e.eta_pct ?? 10));
  const [adjust, setAdjust] = useState(String(e.adjustment ?? 0));
  const [manualKcal, setManualKcal] = useState(e.manual ? String(initial?.kcal_target) : "");

  const input = { weightKg: n(weight), heightCm: n(height), age: n(age), sex: person.sex, leanKg: n(lean) || undefined };
  const allGeb = Object.keys(energyFormulas).map((k) => ({ k: k as EnergyFormula, v: basalEnergy(k as EnergyFormula, input) }));
  const geb = basalEnergy(formula, input);
  const get = Number.isFinite(geb) ? totalEnergy({ geb, activity: n(activity), stress: n(stress), etaPct: n(eta), adjustment: n(adjust) }) : 0;
  const kcal = manualKcal ? n(manualKcal) : get;

  // ---- Macros ----
  const m0 = initial?.macros;
  const [mode, setMode] = useState<"porcentaje" | "gkg">((m0?.mode as "porcentaje" | "gkg") ?? "porcentaje");
  const [pct, setPct] = useState({ p: String(m0?.protein_pct ?? 20), f: String(m0?.fat_pct ?? 30), c: String(m0?.carbs_pct ?? 50) });
  const [gkg, setGkg] = useState({ p: String(m0?.protein_gkg ?? 1.2), f: String(m0?.fat_gkg ?? 0.8) });
  const macros = mode === "porcentaje"
    ? macrosFromPct(kcal, { protein_pct: n(pct.p), fat_pct: n(pct.f), carbs_pct: n(pct.c) })
    : macrosFromGkg(kcal, n(weight), n(gkg.p), n(gkg.f));
  const realPct = pctFromMacros(macros);
  const pctSum = n(pct.p) + n(pct.f) + n(pct.c);

  // ---- Tiempos y equivalentes ----
  const [meals, setMeals] = useState(
    initial?.meals ?? mealDistributionPresets[2].meals.map((m) => ({ ...m, equivalents: {} as Record<string, number> })),
  );
  const mealPctSum = meals.reduce((a, m) => a + m.kcal_pct, 0);
  const daily = useMemo(() => sumCounts(meals.map((m) => m.equivalents)), [meals]);
  const totals = totalsFromEquivalents(daily, groups);
  const mealTotals = meals.map((m) => totalsFromEquivalents(m.equivalents, groups));

  const setEq = (mi: number, code: string, v: string) =>
    setMeals((ms) => ms.map((m, i) => (i === mi ? { ...m, equivalents: { ...m.equivalents, [code]: Math.max(0, n(v)) } } : m)));
  const suggest = () => {
    const d = suggestDailyEquivalents(kcal, macros, groups);
    const split = splitEquivalentsByMeals(d, meals);
    setMeals((ms) => ms.map((m, i) => ({ ...m, equivalents: split[i] })));
  };
  const applyDistribution = (key: string) => {
    const preset = mealDistributionPresets.find((p) => p.key === key);
    if (preset) setMeals(preset.meals.map((m) => ({ ...m, equivalents: {} })));
  };

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
    start(async () => {
      const res = await savePlan(patientId, planId, {
        name, status, start_date: startDate || null,
        energy: { formula, weight: n(weight), height: n(height), age: n(age), lean: n(lean), activity: n(activity), stress: n(stress), eta_pct: n(eta), adjustment: n(adjust), geb, get, manual: manualKcal ? 1 : 0 },
        kcal_target: Math.round(kcal),
        macros: { mode, protein_pct: n(pct.p), fat_pct: n(pct.f), carbs_pct: n(pct.c), protein_gkg: n(gkg.p), fat_gkg: n(gkg.f), ...macros },
        meals, menu, recommendations: recs || null,
      });
      if ("error" in res && res.error) setMsg({ tone: "danger", text: res.error });
      else if ("id" in res) {
        setMsg({ tone: "primary", text: "Plan guardado." });
        if (!planId) router.replace(`/consultorio/pacientes/${patientId}/plan/${res.id}`);
        else router.refresh();
      }
    });
  };

  const adequacyRow = (label: string, got: number, target: number) => {
    const a = adequacy(got, target);
    return (
      <div className="rounded-lg bg-surface-2 p-3">
        <p className="text-xs text-muted">{label}</p>
        <p className="font-semibold tabular-nums">{Math.round(got)} / {Math.round(target)}</p>
        <Badge tone={a.ok ? "primary" : "warn"}>{a.pct} %</Badge>
      </div>
    );
  };

  return (
    <div className="grid gap-4">
      {person.missing && <Alert tone="warn">Faltan sexo, fecha de nacimiento o una medición de peso: se usan valores por defecto. Revísalos.</Alert>}

      <Card title="1 · Requerimiento energético">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Fórmula" className="col-span-2">
            <Select value={formula} onChange={(e) => setFormula(e.target.value as EnergyFormula)}>
              {Object.entries(energyFormulas).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </Select>
          </Field>
          <Field label="Peso (kg)" hint={person.adjustedKg ? `Peso ajustado: ${person.adjustedKg}` : undefined}><Input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Talla (cm)"><Input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Edad"><Input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" /></Field>
          <Field label="Masa libre de grasa (kg)"><Input value={lean} onChange={(e) => setLean(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Factor de actividad">
            <Select value={activity} onChange={(e) => setActivity(e.target.value)}>
              {activityFactors.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </Field>
          <Field label="Factor de estrés"><Input value={stress} onChange={(e) => setStress(e.target.value)} inputMode="decimal" /></Field>
          <Field label="ETA (% del GEB)"><Input value={eta} onChange={(e) => setEta(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Ajuste (kcal)" hint="−500 déficit · +300 superávit"><Input value={adjust} onChange={(e) => setAdjust(e.target.value)} inputMode="numeric" /></Field>
          <Field label="Energía manual (kcal)" hint="Sustituye el cálculo"><Input value={manualKcal} onChange={(e) => setManualKcal(e.target.value)} inputMode="numeric" /></Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {allGeb.map(({ k, v }) => (
                  <tr key={k} className={cn(k === formula && "font-semibold text-primary")}>
                    <td className="py-1 pr-2">{energyFormulas[k].label}</td>
                    <td className="py-1 text-right tabular-nums">{Number.isFinite(v) ? `${v} kcal` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl bg-primary-soft p-4 text-primary">
            <p className="text-xs">GEB {Number.isFinite(geb) ? geb : "—"} kcal</p>
            <p className="text-3xl font-semibold tabular-nums">{Math.round(kcal)} kcal</p>
            <p className="text-xs">{manualKcal ? "Energía manual" : "GET = GEB × FA × FE + ETA + ajuste"}</p>
          </div>
        </div>
      </Card>

      <Card title="2 · Distribución de macronutrientes">
        <div className="mb-3 flex flex-wrap gap-2">
          <Button size="sm" variant={mode === "porcentaje" ? "primary" : "secondary"} onClick={() => setMode("porcentaje")}>Por porcentaje</Button>
          <Button size="sm" variant={mode === "gkg" ? "primary" : "secondary"} onClick={() => setMode("gkg")}>Por g/kg de peso</Button>
          {mode === "porcentaje" && (
            <Select className="h-8 max-w-64" defaultValue="" onChange={(e) => {
              const p = macroPresets.find((x) => x.key === e.target.value);
              if (p) setPct({ p: String(p.pct.protein_pct), f: String(p.pct.fat_pct), c: String(p.pct.carbs_pct) });
            }}>
              <option value="">Aplicar distribución tipo…</option>
              {macroPresets.map((p) => <option key={p.key} value={p.key}>{p.label} ({p.pct.protein_pct}/{p.pct.fat_pct}/{p.pct.carbs_pct})</option>)}
            </Select>
          )}
        </div>
        {mode === "porcentaje" ? (
          <div className="grid grid-cols-3 gap-3 sm:max-w-md">
            <Field label="Proteína %"><Input value={pct.p} onChange={(e) => setPct({ ...pct, p: e.target.value })} /></Field>
            <Field label="Lípidos %"><Input value={pct.f} onChange={(e) => setPct({ ...pct, f: e.target.value })} /></Field>
            <Field label="Hidratos %"><Input value={pct.c} onChange={(e) => setPct({ ...pct, c: e.target.value })} /></Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <Field label="Proteína g/kg"><Input value={gkg.p} onChange={(e) => setGkg({ ...gkg, p: e.target.value })} /></Field>
            <Field label="Lípidos g/kg"><Input value={gkg.f} onChange={(e) => setGkg({ ...gkg, f: e.target.value })} /></Field>
          </div>
        )}
        {mode === "porcentaje" && pctSum !== 100 && <div className="mt-2"><Alert tone="warn">Los porcentajes suman {pctSum} %.</Alert></div>}
        {macroPresets.find((p) => mode === "porcentaje" && p.pct.protein_pct === n(pct.p) && p.pct.fat_pct === n(pct.f) && p.note)?.note && (
          <p className="mt-2 text-xs text-muted">{macroPresets.find((p) => p.pct.protein_pct === n(pct.p) && p.pct.fat_pct === n(pct.f))?.note}</p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm sm:max-w-lg">
          {([["Proteína", macros.protein_g, realPct.protein_pct], ["Lípidos", macros.fat_g, realPct.fat_pct], ["Hidratos", macros.carbs_g, realPct.carbs_pct]] as const).map(([l, g, p]) => (
            <div key={l} className="rounded-lg bg-surface-2 p-3">
              <p className="text-xs text-muted">{l}</p><p className="font-semibold tabular-nums">{g} g</p>
              <p className="text-xs text-muted">{p} % · {(g / (n(weight) || 1)).toFixed(2)} g/kg</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="3 · Tiempos de comida y equivalentes" actions={
        <div className="flex flex-wrap gap-2">
          <Select className="h-8 w-40" defaultValue="" onChange={(e) => applyDistribution(e.target.value)}>
            <option value="">Distribución…</option>
            {mealDistributionPresets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </Select>
          <Button size="sm" variant="secondary" onClick={suggest}>Sugerir equivalentes</Button>
        </div>
      }>
        {Math.abs(mealPctSum - 100) > 0.5 && <div className="mb-3"><Alert tone="warn">Los tiempos suman {mealPctSum} % de la energía.</Alert></div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-1 py-2 text-left">Grupo</th>
                {meals.map((m, i) => (
                  <th key={i} className="px-1 py-2">
                    <Input className="h-8 text-center text-xs" value={m.name} onChange={(e) => setMeals((ms) => ms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <div className="mt-1 flex items-center justify-center gap-1">
                      <Input className="h-7 w-14 text-center text-xs" value={m.kcal_pct} inputMode="decimal"
                        onChange={(e) => setMeals((ms) => ms.map((x, j) => (j === i ? { ...x, kcal_pct: n(e.target.value) } : x)))} />%
                    </div>
                  </th>
                ))}
                <th className="px-1 py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {groups.filter((g) => g.code !== "libres").map((g) => (
                <tr key={g.code}>
                  <td className="px-1 py-1"><span className="flex items-start gap-2"><GroupDot code={g.code} className="mt-1.5" /><span>{g.name}{g.subgroup && <span className="block text-xs text-muted">{g.subgroup}</span>}</span></span></td>
                  {meals.map((m, i) => (
                    <td key={i} className="px-1 py-1">
                      <Input className="h-8 text-center" type="number" min={0} step={0.5} value={m.equivalents[g.code] || ""} onChange={(e) => setEq(i, g.code, e.target.value)} />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center font-medium tabular-nums">{daily[g.code] || ""}</td>
                </tr>
              ))}
              <tr className="bg-surface-2 text-xs">
                <td className="px-1 py-2 font-medium">kcal (meta)</td>
                {meals.map((m, i) => <td key={i} className="px-1 py-2 text-center tabular-nums">{mealTotals[i].kcal} ({Math.round((kcal * m.kcal_pct) / 100)})</td>)}
                <td className="px-1 py-2 text-center font-semibold tabular-nums">{totals.kcal}</td>
              </tr>
              <tr className="bg-surface-2 text-xs">
                <td className="px-1 py-2 font-medium">P / L / HC (g)</td>
                {mealTotals.map((t, i) => <td key={i} className="px-1 py-2 text-center tabular-nums">{t.protein_g} / {t.fat_g} / {t.carbs_g}</td>)}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {adequacyRow("Energía (kcal)", totals.kcal, kcal)}
          {adequacyRow("Proteína (g)", totals.protein_g, macros.protein_g)}
          {adequacyRow("Lípidos (g)", totals.fat_g, macros.fat_g)}
          {adequacyRow("Hidratos (g)", totals.carbs_g, macros.carbs_g)}
        </div>
        <p className="mt-2 text-xs text-muted">Adecuación aceptable: 95–105 %. Grupos libres de energía no se cuentan.</p>
      </Card>

      <Card title="4 · Menú semanal (opcional)">
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

      <Card title="5 · Recomendaciones y estado">
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
        {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={save} disabled={pending}>{pending ? "Guardando…" : "Guardar plan"}</Button>
          {planId && <a className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm" href={`/api/pdf/plan/${planId}`} target="_blank">Descargar PDF</a>}
        </div>
      </Card>
    </div>
  );
}
