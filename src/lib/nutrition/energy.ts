// Ecuaciones de gasto energético basal (kcal/día). Peso en kg, talla en cm, edad en años.
import type { Sex } from "./anthropometry";

export type EnergyInput = { weightKg: number; heightCm: number; age: number; sex: Sex; leanKg?: number };

type Band = [maxAge: number, a: number, b: number]; // kcal = a·peso + b
const byAge = (bands: Band[], age: number, w: number) => {
  const [, a, b] = bands.find(([max]) => age < max) ?? bands[bands.length - 1];
  return a * w + b;
};

const FAO: Record<Sex, Band[]> = {
  M: [[3, 60.9, -54], [10, 22.7, 495], [18, 17.5, 651], [30, 15.3, 679], [60, 11.6, 879], [Infinity, 13.5, 487]],
  F: [[3, 61.0, -51], [10, 22.5, 499], [18, 12.2, 746], [30, 14.7, 496], [60, 8.7, 829], [Infinity, 10.5, 596]],
};
const SCHOFIELD: Record<Sex, Band[]> = {
  M: [[3, 59.512, -30.4], [10, 22.706, 504.3], [18, 17.686, 658.2], [30, 15.057, 692.2], [60, 11.472, 873.1], [Infinity, 11.711, 587.7]],
  F: [[3, 58.317, -31.1], [10, 20.315, 485.9], [18, 13.384, 692.6], [30, 14.818, 486.6], [60, 8.126, 845.6], [Infinity, 9.082, 658.5]],
};
// Valencia et al. (población mexicana, adultos)
const VALENCIA: Record<Sex, Band[]> = {
  M: [[30, 13.37, 747], [60, 13.08, 693], [Infinity, 14.21, 429]],
  F: [[30, 11.02, 679], [60, 10.92, 677], [Infinity, 10.98, 520]],
};

export const energyFormulas = {
  harris_benedict: {
    label: "Harris-Benedict (1919)",
    fn: ({ weightKg: w, heightCm: h, age: a, sex }: EnergyInput) =>
      sex === "M" ? 66.473 + 13.7516 * w + 5.0033 * h - 6.755 * a : 655.0955 + 9.5634 * w + 1.8496 * h - 4.6756 * a,
  },
  mifflin: {
    label: "Mifflin-St Jeor",
    fn: ({ weightKg: w, heightCm: h, age: a, sex }: EnergyInput) => 10 * w + 6.25 * h - 5 * a + (sex === "M" ? 5 : -161),
  },
  fao_oms: {
    label: "FAO/OMS (1985)",
    fn: ({ weightKg, age, sex }: EnergyInput) => byAge(FAO[sex], age, weightKg),
  },
  schofield: {
    label: "Schofield",
    fn: ({ weightKg, age, sex }: EnergyInput) => byAge(SCHOFIELD[sex], age, weightKg),
  },
  valencia: {
    label: "Valencia (población mexicana)",
    fn: ({ weightKg, age, sex }: EnergyInput) => byAge(VALENCIA[sex], Math.max(age, 18), weightKg),
  },
  owen: {
    label: "Owen",
    fn: ({ weightKg, sex }: EnergyInput) => (sex === "M" ? 879 + 10.2 * weightKg : 795 + 7.18 * weightKg),
  },
  katch_mcardle: {
    label: "Katch-McArdle (requiere masa libre de grasa)",
    fn: ({ leanKg }: EnergyInput) => (leanKg ? 370 + 21.6 * leanKg : NaN),
  },
  cunningham: {
    label: "Cunningham (requiere masa libre de grasa)",
    fn: ({ leanKg }: EnergyInput) => (leanKg ? 500 + 22 * leanKg : NaN),
  },
} as const;

export type EnergyFormula = keyof typeof energyFormulas;

export function basalEnergy(formula: EnergyFormula, input: EnergyInput) {
  return Math.round(energyFormulas[formula].fn(input));
}

export const activityFactors = [
  { value: 1.2, label: "Sedentario (1.2)" },
  { value: 1.375, label: "Ligera (1.375)" },
  { value: 1.55, label: "Moderada (1.55)" },
  { value: 1.725, label: "Intensa (1.725)" },
  { value: 1.9, label: "Muy intensa (1.9)" },
];

/**
 * Gasto energético total = GEB × FA × FE + ETA (ETA como % del GEB).
 * `adjustment` suma o resta kcal (p. ej. −500 para déficit).
 */
export function totalEnergy(p: { geb: number; activity: number; stress?: number; etaPct?: number; adjustment?: number }) {
  const eta = (p.geb * (p.etaPct ?? 10)) / 100;
  return Math.round(p.geb * p.activity * (p.stress ?? 1) + eta + (p.adjustment ?? 0));
}

/** Método rápido kcal/kg/día */
export const kcalPerKg = (weightKg: number, factor: number) => Math.round(weightKg * factor);
