"use client";
import { Eraser, Minus, Plus, Shuffle, Trash2, WandSparkles } from "lucide-react";
import {
  adequacy, mealDistributionPresets, splitEquivalentsByMeals, suggestDailyEquivalents, sumCounts, totalsFromEquivalents,
  type Group, type Macros,
} from "@/lib/nutrition";
import { FAMILY_ORDER, familyColor, groupFamily } from "@/lib/groups";
import { ADEQUACY_SCALE, RangeGauge } from "@/components/range-gauge";
import { Button, cn } from "@/components/ui";
import { NumField } from "./macro-studio";

export type Meal = { name: string; kcal_pct: number; equivalents: Record<string, number> };
export type CustomMealPreset = { id: string; name: string; meals: { name: string; kcal_pct: number }[] };
const half = (v: number) => Math.max(0, Math.round(v * 2) / 2);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Qué grupo cubre mejor lo que falta (o sobra) de cada macronutriente. */
const FIXERS = [
  { macro: "protein_g", label: "proteína", code: "aoa_mb", min: 4 },
  { macro: "carbs_g", label: "hidratos", code: "cereales_sg", min: 8 },
  { macro: "fat_g", label: "lípidos", code: "grasas_sp", min: 3 },
] as const;

/**
 * Cuadro dietosintético: equivalentes por grupo y por tiempo de comida, con adecuación en vivo.
 * "Automático" propone todo; cada celda se ajusta a mano de medio en medio equivalente.
 */
export function EquivalentsBoard({ groups, meals, onMeals, kcal, macros, customPresets = [], onSavePreset }: {
  groups: Group[]; meals: Meal[]; onMeals: (fn: (m: Meal[]) => Meal[]) => void; kcal: number; macros: Macros;
  customPresets?: CustomMealPreset[]; onSavePreset?: (name: string) => void;
}) {
  const rows = groups.filter((g) => groupFamily(g.code) !== "libres");
  const byFamily = FAMILY_ORDER.map((f) => ({ f, items: rows.filter((g) => groupFamily(g.code) === f) })).filter((x) => x.items.length);
  const daily = sumCounts(meals.map((m) => m.equivalents));
  const totals = totalsFromEquivalents(daily, groups);
  const mealTotals = meals.map((m) => totalsFromEquivalents(m.equivalents, groups));
  const pctSum = r1(meals.reduce((a, m) => a + m.kcal_pct, 0));
  const empty = Object.values(daily).every((v) => !v);

  const setEq = (mi: number, code: string, v: number) =>
    onMeals((ms) => ms.map((m, i) => (i === mi ? { ...m, equivalents: { ...m.equivalents, [code]: half(v) } } : m)));
  const patchMeal = (mi: number, patch: Partial<Meal>) => onMeals((ms) => ms.map((m, i) => (i === mi ? { ...m, ...patch } : m)));
  const auto = () => {
    const split = splitEquivalentsByMeals(suggestDailyEquivalents(kcal, macros, groups), meals);
    onMeals((ms) => ms.map((m, i) => ({ ...m, equivalents: split[i] })));
  };
  const redistribute = () => {
    const split = splitEquivalentsByMeals(daily, meals);
    onMeals((ms) => ms.map((m, i) => ({ ...m, equivalents: split[i] })));
  };
  const normalize = () => onMeals((ms) => {
    const sum = ms.reduce((a, m) => a + m.kcal_pct, 0) || 1;
    const out = ms.map((m) => ({ ...m, kcal_pct: Math.round((m.kcal_pct * 100) / sum) }));
    out[out.length - 1].kcal_pct += 100 - out.reduce((a, m) => a + m.kcal_pct, 0);
    return out;
  });
  const applyPreset = (list: { name: string; kcal_pct: number }[]) => {
    const split = splitEquivalentsByMeals(daily, list);
    onMeals(() => list.map((m, i) => ({ ...m, equivalents: split[i] })));
  };

  // Tiempo con mayor faltante (o sobrante) de energía, para colocar ahí el ajuste sugerido
  const gap = meals.map((m, i) => (kcal * m.kcal_pct) / 100 - mealTotals[i].kcal);
  const neediest = gap.indexOf(Math.max(...gap));
  type Hint = { key: string; text: string; action: string; run: (() => void) | null };
  const hints: Hint[] = empty ? [] : FIXERS.flatMap((fx): Hint[] => {
    const g = groups.find((x) => x.code === fx.code);
    if (!g) return [];
    const rem = macros[fx.macro] - totals[fx.macro];
    if (Math.abs(rem) < fx.min) return [];
    const per = Number(g[fx.macro]) || 1;
    const n = Math.max(0.5, half(Math.abs(rem) / per));
    if (rem > 0) return [{ key: fx.code, text: `Faltan ${Math.round(rem)} g de ${fx.label}`, action: `+${n} ${g.name}${g.subgroup ? ` (${g.subgroup})` : ""} en ${meals[neediest]?.name}`, run: () => setEq(neediest, fx.code, (meals[neediest].equivalents[fx.code] ?? 0) + n) }];
    const from = meals.map((m, i) => ({ i, v: m.equivalents[fx.code] ?? 0, gap: gap[i] })).filter((x) => x.v > 0).sort((a, b) => a.gap - b.gap)[0];
    if (!from) return [{ key: fx.code, text: `Sobran ${Math.round(-rem)} g de ${fx.label}`, action: "", run: null }];
    const k = Math.min(from.v, n);
    return [{ key: fx.code, text: `Sobran ${Math.round(-rem)} g de ${fx.label}`, action: `−${k} ${g.name}${g.subgroup ? ` (${g.subgroup})` : ""} en ${meals[from.i].name}`, run: () => setEq(from.i, fx.code, from.v - k) }];
  });

  const gauge = (label: string, got: number, goal: number, unit: string) => {
    const a = adequacy(got, goal), diff = Math.round(got - goal);
    return (
      <div className="rounded-xl border border-border bg-surface p-3">
        <RangeGauge compact scale={ADEQUACY_SCALE} value={goal ? a.pct : null} label={label} />
        <p className="tabular mt-2 text-sm font-semibold">{Math.round(got)} <span className="text-xs font-normal text-muted">de {Math.round(goal)} {unit}</span></p>
        <p className={cn("text-[11px]", a.ok ? "text-primary" : "text-warn")}>{a.ok ? "Dentro de 95–105 %" : diff < 0 ? `Faltan ${-diff} ${unit}` : `Sobran ${diff} ${unit}`}</p>
      </div>
    );
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={auto}><WandSparkles className="size-4" aria-hidden />Automático</Button>
        <Button size="sm" variant="secondary" onClick={redistribute} disabled={empty} title="Conserva los equivalentes del día y los reparte según el % de cada tiempo"><Shuffle className="size-4" aria-hidden />Repartir por %</Button>
        <Button size="sm" variant="ghost" onClick={() => onMeals((ms) => ms.map((m) => ({ ...m, equivalents: {} })))} disabled={empty}><Eraser className="size-4" aria-hidden />Limpiar</Button>
        <select aria-label="Tiempos de comida" value="" className="ml-auto h-8 rounded-full border border-border bg-surface px-3 text-sm"
          onChange={(e) => {
            const [kind, key] = e.target.value.split(":");
            const list = kind === "c" ? customPresets.find((p) => p.id === key)?.meals : mealDistributionPresets.find((p) => p.key === key)?.meals;
            if (list) applyPreset(list);
          }}>
          <option value="">Tiempos de comida…</option>
          {customPresets.length > 0 && <optgroup label="Mis distribuciones">{customPresets.map((p) => <option key={p.id} value={`c:${p.id}`}>{p.name}</option>)}</optgroup>}
          <optgroup label="Distribuciones tipo">{mealDistributionPresets.map((p) => <option key={p.key} value={`b:${p.key}`}>{p.label}</option>)}</optgroup>
        </select>
        {onSavePreset && pctSum === 100 && (
          <Button size="sm" variant="ghost" onClick={() => { const name = window.prompt("Nombre de la distribución de tiempos", `${meals.length} tiempos`); if (name?.trim()) onSavePreset(name.trim()); }}>Guardar tiempos</Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite">
        {gauge("Energía", totals.kcal, kcal, "kcal")}
        {gauge("Proteína", totals.protein_g, macros.protein_g, "g")}
        {gauge("Lípidos", totals.fat_g, macros.fat_g, "g")}
        {gauge("Hidratos", totals.carbs_g, macros.carbs_g, "g")}
      </div>

      {hints.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {hints.map((h) => (
            <li key={h.key} className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-3 pr-1 text-xs">
              <span className="text-muted">{h.text}</span>
              {h.run && <button type="button" onClick={h.run} className="rounded-full bg-primary-soft px-2.5 py-1 font-semibold text-primary hover:brightness-95">{h.action}</button>}
            </li>
          ))}
        </ul>
      )}

      {pctSum !== 100 && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn" role="alert">
          Los tiempos suman {pctSum} % de la energía; deben sumar 100 %.
          <button type="button" onClick={normalize} className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-text">Ajustar a 100 %</button>
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm" style={{ minWidth: 220 + meals.length * 128 + 90 }}>
          <thead>
            <tr className="bg-surface-2/70 align-bottom">
              <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-muted">Grupo · aporte por equivalente</th>
              {meals.map((m, i) => {
                const goal = Math.round((kcal * m.kcal_pct) / 100), got = mealTotals[i].kcal;
                const off = goal ? Math.abs(got - goal) / goal : 0;
                return (
                  <th key={i} className="w-32 px-1.5 py-2 font-normal">
                    <div className="flex items-center gap-1">
                      <input aria-label={`Nombre del tiempo ${i + 1}`} value={m.name} maxLength={60} onChange={(e) => patchMeal(i, { name: e.target.value })}
                        className="h-8 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-1.5 text-center text-xs font-semibold hover:border-border focus:border-primary focus:bg-surface focus:outline-none" />
                      {meals.length > 1 && (
                        <button type="button" aria-label={`Quitar ${m.name}`} title="Quitar tiempo" onClick={() => onMeals((ms) => ms.filter((_, j) => j !== i))} className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="size-3.5" /></button>
                      )}
                    </div>
                    <NumField label={`Porcentaje de energía de ${m.name}`} value={m.kcal_pct} step={5} max={100} suffix="%" className="mx-auto mt-1 w-20" onCommit={(v) => patchMeal(i, { kcal_pct: v })} />
                    <p className={cn("tabular mt-1 text-[11px]", got === 0 ? "text-muted" : off <= 0.1 ? "text-primary" : "text-warn")}>{got} / {goal} kcal</p>
                  </th>
                );
              })}
              <th className="w-20 px-2 py-2 text-center text-xs font-semibold text-muted">
                Día
                {meals.length < 8 && (
                  <button type="button" onClick={() => onMeals((ms) => [...ms, { name: "Colación", kcal_pct: 0, equivalents: {} }])} title="Agregar tiempo de comida" aria-label="Agregar tiempo de comida"
                    className="mx-auto mt-1 grid size-7 place-items-center rounded-full border border-dashed border-border text-muted hover:border-primary hover:text-primary"><Plus className="size-4" /></button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {byFamily.map(({ f, items }) => items.map((g, gi) => (
              <tr key={g.code} className={cn("border-t border-border", gi === 0 && "border-t-2")}>
                <td className="sticky left-0 z-10 bg-surface px-3 py-1.5" style={{ boxShadow: `inset 4px 0 0 ${familyColor(f)}` }}>
                  <p className="font-medium leading-tight">{g.subgroup ? <>{g.name} <span className="text-xs font-normal text-muted">· {g.subgroup}</span></> : g.name}</p>
                  <p className="tabular text-[11px] text-muted">{Number(g.kcal)} kcal · P {Number(g.protein_g)} · L {Number(g.fat_g)} · HC {Number(g.carbs_g)}</p>
                </td>
                {meals.map((m, i) => {
                  const v = m.equivalents[g.code] ?? 0;
                  return (
                    <td key={i} className="px-1.5 py-1.5">
                      <div className={cn("mx-auto flex h-8 w-[104px] items-center rounded-full border transition-colors", v > 0 ? "border-transparent text-white" : "border-border bg-surface")} style={v > 0 ? { background: familyColor(f) } : undefined}>
                        <button type="button" aria-label={`Quitar medio equivalente de ${g.name} en ${m.name}`} disabled={v <= 0} onClick={() => setEq(i, g.code, v - 0.5)} className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-30 enabled:hover:bg-black/10"><Minus className="size-3.5" /></button>
                        <input aria-label={`${g.name}${g.subgroup ? ` ${g.subgroup}` : ""} en ${m.name}`} inputMode="decimal" value={v || ""} placeholder="0"
                          onChange={(e) => { const x = Number(e.target.value.replace(",", ".")); if (e.target.value === "" || Number.isFinite(x)) setEq(i, g.code, Math.min(50, x || 0)); }}
                          className={cn("tabular h-8 w-full min-w-0 bg-transparent text-center text-sm font-bold focus:outline-none", v > 0 ? "placeholder:text-white/70" : "placeholder:text-muted/50")} />
                        <button type="button" aria-label={`Agregar medio equivalente de ${g.name} en ${m.name}`} onClick={() => setEq(i, g.code, v + 0.5)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/10"><Plus className="size-3.5" /></button>
                      </div>
                    </td>
                  );
                })}
                <td className="tabular px-2 py-1.5 text-center font-display text-base font-bold">{daily[g.code] || <span className="text-muted/40">·</span>}</td>
              </tr>
            )))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-2/70 text-xs">
              <td className="sticky left-0 z-10 bg-surface-2 px-3 py-2 font-semibold">P · L · HC (g)</td>
              {mealTotals.map((t, i) => <td key={i} className="tabular px-1.5 py-2 text-center">{r1(t.protein_g)} · {r1(t.fat_g)} · {r1(t.carbs_g)}</td>)}
              <td className="tabular px-2 py-2 text-center font-semibold">{totals.kcal} kcal</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted">Cada toque suma o quita medio equivalente. Los grupos libres de energía no se cuentan.</p>
    </div>
  );
}
