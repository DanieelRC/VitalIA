"use client";
import { Eraser, WandSparkles } from "lucide-react";
import { adequacy, splitEquivalentsByMeals, suggestDailyEquivalents, sumCounts, totalsFromEquivalents, type Group, type Macros } from "@/lib/nutrition";
import { FAMILY_ORDER, familyColor, groupFamily } from "@/lib/groups";
import { Button, cn } from "@/components/ui";
import { NumField } from "./macro-studio";
import type { Meal } from "./equivalents-board";

const r1 = (v: number) => Math.round(v * 10) / 10;
const half = (v: number) => Math.max(0, Math.round(v * 2) / 2);

/**
 * Dietocálculo: equivalentes del día por grupo. Cada grupo se mueve con un deslizador o escribiendo, y se ve al instante
 * cuánta energía y macronutrientes aporta y la adecuación contra la meta. El total del día se reparte entre los tiempos
 * según su % de energía (se afina en «Distribución»).
 */
export function DietCalc({ groups, meals, onMeals, kcal, macros }: {
  groups: Group[]; meals: Meal[]; onMeals: (fn: (m: Meal[]) => Meal[]) => void; kcal: number; macros: Macros;
}) {
  const rows = FAMILY_ORDER.flatMap((f) => groups.filter((g) => groupFamily(g.code) === f && f !== "libres"));
  const daily = sumCounts(meals.map((m) => m.equivalents));
  const totals = totalsFromEquivalents(daily, groups);
  const empty = Object.values(daily).every((v) => !v);

  const setDaily = (code: string, v: number) => {
    const split = splitEquivalentsByMeals({ [code]: half(Math.min(40, v)) }, meals);
    onMeals((ms) => ms.map((m, i) => ({ ...m, equivalents: { ...m.equivalents, [code]: split[i][code] ?? 0 } })));
  };
  const auto = () => {
    const split = splitEquivalentsByMeals(suggestDailyEquivalents(kcal, macros, groups), meals);
    onMeals((ms) => ms.map((m, i) => ({ ...m, equivalents: split[i] })));
  };
  const cols = [
    { label: "kcal", got: totals.kcal, goal: kcal }, { label: "Proteína", got: totals.protein_g, goal: macros.protein_g },
    { label: "Lípidos", got: totals.fat_g, goal: macros.fat_g }, { label: "Hidratos", got: totals.carbs_g, goal: macros.carbs_g },
  ];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={auto}><WandSparkles className="size-4" aria-hidden />Automático</Button>
        <Button size="sm" variant="ghost" disabled={empty} onClick={() => onMeals((ms) => ms.map((m) => ({ ...m, equivalents: {} })))}><Eraser className="size-4" aria-hidden />Limpiar</Button>
        <p className="ml-auto text-xs text-muted">El total de cada grupo se reparte entre los tiempos según su % de energía.</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <colgroup><col className="w-48" /><col /><col className="w-24" /><col className="w-16" /><col className="w-14" /><col className="w-14" /><col className="w-16" /></colgroup>
          <thead>
            <tr className="bg-surface-2/70 text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-3 py-2 text-left">Grupo</th><th className="px-3 py-2 text-left">Equivalentes</th>
              <th className="w-24 px-2 py-2">Eq</th><th className="w-16 px-2 py-2 text-right">kcal</th><th className="w-14 px-2 py-2 text-right">Pro</th><th className="w-14 px-2 py-2 text-right">Lip</th><th className="w-14 px-2 py-2 pr-3 text-right">HCO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const v = daily[g.code] ?? 0, c = familyColor(groupFamily(g.code)), max = Math.max(12, Math.ceil(v) + 2);
              const cell = (n: number) => (v ? <span className="tabular">{r1(n * v)}</span> : <span className="text-muted/40">—</span>);
              return (
                <tr key={g.code} className="border-t border-border">
                  <td className="py-1.5 pl-3 pr-2 leading-tight" style={{ boxShadow: `inset 4px 0 0 ${c}` }}>
                    <span className="font-medium">{g.name}</span>{g.subgroup && <span className="block text-[11px] leading-tight text-muted">{g.subgroup}</span>}
                  </td>
                  <td className="px-3 py-1.5" style={{ ["--c" as string]: c }}>
                    <div className="relative h-7">
                      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full transition-[width] duration-200 ease-out-expo" style={{ width: `${(v / max) * 100}%`, background: c }} />
                      </div>
                      <input type="range" min={0} max={max} step={0.5} value={v} onChange={(e) => setDaily(g.code, Number(e.target.value))}
                        aria-label={`Equivalentes al día de ${g.name}${g.subgroup ? ` ${g.subgroup}` : ""}`} className="macro-slider absolute inset-0" />
                    </div>
                  </td>
                  <td className="px-2 py-1.5"><NumField label={`${g.name} equivalentes`} value={v} step={0.5} max={40} onCommit={(n) => setDaily(g.code, n)} className="[&_input]:text-center" /></td>
                  <td className="px-2 py-1.5 text-right">{cell(Number(g.kcal))}</td><td className="px-2 py-1.5 text-right">{cell(Number(g.protein_g))}</td>
                  <td className="px-2 py-1.5 text-right">{cell(Number(g.fat_g))}</td><td className="px-2 py-1.5 pr-3 text-right">{cell(Number(g.carbs_g))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-border bg-surface-2/70" aria-live="polite">
            <tr className="text-xs">
              <td className="px-3 py-2 font-semibold" colSpan={3}>Suma <span className="font-normal text-muted">/ meta</span></td>
              {cols.map((c) => <td key={c.label} className="tabular px-2 py-2 text-right last:pr-3"><b>{Math.round(c.got)}</b><span className="block text-muted">{Math.round(c.goal)}</span></td>)}
            </tr>
            <tr className="text-xs">
              <td className="px-3 pb-2.5 font-semibold" colSpan={3}>Adecuación <span className="font-normal text-muted">(aceptable 95–105 %)</span></td>
              {cols.map((c) => {
                const a = adequacy(c.got, c.goal);
                return <td key={c.label} className="px-1 pb-2.5 text-right last:pr-3"><span className={cn("tabular inline-block min-w-12 rounded-md px-1.5 py-1 text-center font-bold transition-colors", c.got === 0 ? "bg-surface text-muted" : a.ok ? "bg-primary-soft text-primary" : a.pct < 95 ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger")}>{c.goal ? a.pct : 0} %</span></td>;
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
