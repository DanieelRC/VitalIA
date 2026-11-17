// Distribución de macronutrientes con deslizadores y candados.
// La fuente de verdad son los porcentajes de energía; gramos y g/kg se derivan.
import { KCAL } from "./macros";

export type MacroKey = "protein" | "fat" | "carbs";
export const MACRO_KEYS: MacroKey[] = ["protein", "fat", "carbs"];
/** Candado: "pct" fija el porcentaje; "g" fija los gramos (y por tanto los g/kg) aunque cambie la energía. */
export type Lock = "pct" | "g" | null;
export type MacroState = { pct: Record<MacroKey, number>; locks: Record<MacroKey, Lock> };

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

export const gramsOf = (key: MacroKey, pct: number, kcal: number) => (kcal * pct) / 100 / KCAL[key];
export const pctOf = (key: MacroKey, grams: number, kcal: number) => (kcal > 0 ? (grams * KCAL[key] * 100) / kcal : 0);

/** Valores derivados para mostrar: gramos, g/kg, kcal por macro, suma y energía sin asignar. */
export function describeMacros(state: MacroState, kcal: number, weightKg: number) {
  const rows = MACRO_KEYS.map((key) => {
    const g = gramsOf(key, state.pct[key], kcal);
    return { key, pct: r1(state.pct[key]), g: r1(g), gkg: weightKg > 0 ? Math.round((g / weightKg) * 100) / 100 : 0, kcal: Math.round(g * KCAL[key]), lock: state.locks[key] };
  });
  const sum = r1(rows.reduce((a, r) => a + r.pct, 0));
  return { rows, sum, unassignedKcal: Math.round((kcal * (100 - sum)) / 100), balanced: Math.abs(sum - 100) < 0.05 };
}

/**
 * Mueve un macro a `newPct`. Los bloqueados no cambian. Si queda uno libre, absorbe la diferencia;
 * si quedan dos libres, se la reparten en proporción a su valor actual; si no queda ninguno,
 * el macro se mueve solo y la suma deja de ser 100 % (la interfaz muestra cuánto sobra o falta).
 */
export function moveMacro(state: MacroState, key: MacroKey, newPct: number): MacroState {
  const others = MACRO_KEYS.filter((k) => k !== key);
  const free = others.filter((k) => !state.locks[k]);
  const lockedSum = others.filter((k) => state.locks[k]).reduce((a, k) => a + state.pct[k], 0);
  // Con macros libres, el que se mueve no puede pasar de lo que dejan los bloqueados
  const value = free.length ? clamp(newPct, 0, Math.max(0, 100 - lockedSum)) : clamp(newPct);
  const pct = { ...state.pct, [key]: r1(value) };
  if (free.length === 1) {
    pct[free[0]] = r1(Math.max(0, 100 - lockedSum - value));
  } else if (free.length === 2) {
    const rest = Math.max(0, 100 - value);
    const base = state.pct[free[0]] + state.pct[free[1]];
    const a = base > 0 ? (rest * state.pct[free[0]]) / base : rest / 2;
    pct[free[0]] = r1(a);
    pct[free[1]] = r1(rest - r1(a));
  }
  return { ...state, pct };
}

/** Mueve un macro expresado en gramos o en g/kg. */
export const moveMacroGrams = (state: MacroState, key: MacroKey, grams: number, kcal: number) => moveMacro(state, key, pctOf(key, grams, kcal));
export const moveMacroGkg = (state: MacroState, key: MacroKey, gkg: number, kcal: number, weightKg: number) => moveMacroGrams(state, key, gkg * weightKg, kcal);

/**
 * La energía cambió: los macros con candado en gramos conservan sus gramos (su % se recalcula) y
 * los libres se reparten el resto conservando su proporción. Los candados en % no se mueven.
 */
export function rescaleForKcal(state: MacroState, oldKcal: number, newKcal: number): MacroState {
  if (!(oldKcal > 0) || !(newKcal > 0) || oldKcal === newKcal) return state;
  const fixedG = MACRO_KEYS.filter((k) => state.locks[k] === "g");
  if (!fixedG.length) return state;
  const pct = { ...state.pct };
  for (const k of fixedG) pct[k] = r1(pctOf(k, gramsOf(k, state.pct[k], oldKcal), newKcal));
  const free = MACRO_KEYS.filter((k) => !state.locks[k]);
  const taken = MACRO_KEYS.filter((k) => state.locks[k]).reduce((a, k) => a + pct[k], 0);
  const rest = Math.max(0, 100 - taken);
  const base = free.reduce((a, k) => a + state.pct[k], 0);
  free.forEach((k, i) => {
    pct[k] = i === free.length - 1
      ? r1(rest - free.slice(0, -1).reduce((a, x) => a + pct[x], 0))
      : r1(base > 0 ? (rest * state.pct[k]) / base : rest / free.length);
  });
  return { ...state, pct };
}

export const toggleLock = (state: MacroState, key: MacroKey, lock: Exclude<Lock, null>): MacroState =>
  ({ ...state, locks: { ...state.locks, [key]: state.locks[key] === lock ? null : lock } });

// ---- Equilibrio ----
export type Range = { low: number; high: number };
export type BalanceRanges = { pct: Record<MacroKey, Range>; gkg: Record<MacroKey, Range> };

/** Rangos aceptables de distribución (AMDR, IOM) y referencias en g/kg para adultos sanos. */
export const DEFAULT_RANGES: BalanceRanges = {
  pct: { protein: { low: 10, high: 35 }, fat: { low: 20, high: 35 }, carbs: { low: 45, high: 65 } },
  gkg: { protein: { low: 0.8, high: 2.2 }, fat: { low: 0.5, high: 1.5 }, carbs: { low: 3, high: 8 } },
};

export type Status = "bajo" | "normal" | "alto";
export const statusOf = (v: number, r: Range): Status => (v < r.low ? "bajo" : v > r.high ? "alto" : "normal");

export function macroBalance(state: MacroState, kcal: number, weightKg: number, ranges: BalanceRanges = DEFAULT_RANGES) {
  const d = describeMacros(state, kcal, weightKg);
  const rows = d.rows.map((r) => ({ ...r, pctStatus: statusOf(r.pct, ranges.pct[r.key]), gkgStatus: weightKg > 0 ? statusOf(r.gkg, ranges.gkg[r.key]) : ("normal" as Status) }));
  const outOfRange = rows.filter((r) => r.pctStatus !== "normal").length;
  return { ...d, rows, verdict: !d.balanced ? ("descuadrada" as const) : outOfRange === 0 ? ("equilibrada" as const) : ("fuera_de_rango" as const) };
}
