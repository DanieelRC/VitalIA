// Cálculos clínicos adicionales: somatotipo, embarazo, deporte y escalas de referencia para graficar rangos.
import type { Sex } from "./anthropometry";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

// ---- Somatotipo antropométrico de Heath-Carter (Carter & Heath, 1990) ----
export type SomatotypeInput = {
  heightCm: number; weightKg: number;
  triceps: number; subscapular: number; supraspinale: number; calfSkinfold: number; // pliegues en mm
  humerus: number; femur: number;          // diámetros biepicondilares en cm
  armFlexed: number; calf: number;         // circunferencias en cm (brazo flexionado y contraído; pantorrilla máxima)
};

export function somatotype(i: SomatotypeInput) {
  const x = ((i.triceps + i.subscapular + i.supraspinale) * 170.18) / i.heightCm;
  const endo = -0.7182 + 0.1451 * x - 0.00068 * x ** 2 + 0.0000014 * x ** 3;
  const meso = 0.858 * i.humerus + 0.601 * i.femur + 0.188 * (i.armFlexed - i.triceps / 10) + 0.161 * (i.calf - i.calfSkinfold / 10) - 0.131 * i.heightCm + 4.5;
  const hwr = i.heightCm / Math.cbrt(i.weightKg);
  const ecto = hwr >= 40.75 ? 0.732 * hwr - 28.58 : hwr > 38.25 ? 0.463 * hwr - 17.63 : 0.1;
  const e = Math.max(0.1, r1(endo)), m = Math.max(0.1, r1(meso)), c = Math.max(0.1, r1(ecto));
  // Coordenadas de la somatocarta: X = ecto − endo; Y = 2·meso − (endo + ecto)
  return { endo: e, meso: m, ecto: c, hwr: r2(hwr), x: r1(c - e), y: r1(2 * m - (e + c)), label: somatotypeLabel(e, m, c) };
}

/** Categoría simplificada según el componente dominante. */
export function somatotypeLabel(endo: number, meso: number, ecto: number) {
  const parts = [{ n: "Endomorfo", a: "endomórfico", v: endo }, { n: "Mesomorfo", a: "mesomórfico", v: meso }, { n: "Ectomorfo", a: "ectomórfico", v: ecto }]
    .sort((p, q) => q.v - p.v);
  if (parts[0].v - parts[2].v < 1) return "Central";
  if (parts[0].v - parts[1].v < 0.5) return `${parts[0].n}-${parts[1].n.toLowerCase()}`;
  return parts[1].v - parts[2].v >= 0.5 ? `${parts[0].n} ${parts[1].a}` : `${parts[0].n} balanceado`;
}

// ---- Embarazo (IOM 2009) ----
export const PREGNANCY_GAIN = [
  { max: 18.5, label: "Bajo peso", total: [12.5, 18], weekly: [0.44, 0.58] },
  { max: 25, label: "Peso normal", total: [11.5, 16], weekly: [0.35, 0.5] },
  { max: 30, label: "Sobrepeso", total: [7, 11.5], weekly: [0.23, 0.33] },
  { max: Infinity, label: "Obesidad", total: [5, 9], weekly: [0.17, 0.27] },
] as const;
/** Energía adicional por trimestre (IOM): 0, +340 y +452 kcal/día. */
export const PREGNANCY_KCAL = [0, 340, 452] as const;

export function pregnancyPlan(preBmi: number, preWeightKg: number, week: number) {
  const band = PREGNANCY_GAIN.find((b) => preBmi < b.max)!;
  const trimester = week <= 13 ? 1 : week <= 27 ? 2 : 3;
  // 1.er trimestre: 0.5–2 kg en total; después, la ganancia semanal del rango
  const first = [0.5, 2];
  const weeksAfter = Math.max(0, Math.min(week, 40) - 13);
  const expected = week <= 13
    ? [r1((first[0] * week) / 13), r1((first[1] * week) / 13)]
    : [r1(first[0] + band.weekly[0] * weeksAfter), r1(first[1] + band.weekly[1] * weeksAfter)];
  return {
    category: band.label, trimester, totalGain: [...band.total], weeklyGain: [...band.weekly], extraKcal: PREGNANCY_KCAL[trimester - 1],
    expectedGainNow: expected, expectedWeightNow: [r1(preWeightKg + expected[0]), r1(preWeightKg + expected[1])],
  };
}

// ---- Deporte (ISSN / ACSM) ----
export const TRAINING_LOADS = [
  { key: "ligero", label: "Ligero (habilidad, baja intensidad)", carbs: [3, 5] },
  { key: "moderado", label: "Moderado (~1 h/día)", carbs: [5, 7] },
  { key: "alto", label: "Alto (1–3 h/día, resistencia)", carbs: [6, 10] },
  { key: "muy_alto", label: "Muy alto (>4–5 h/día)", carbs: [8, 12] },
] as const;
export const ATHLETE_GOALS = [
  { key: "mantener", label: "Mantenimiento / rendimiento", protein: [1.4, 2.0] },
  { key: "hipertrofia", label: "Ganancia de masa muscular", protein: [1.6, 2.2] },
  { key: "deficit", label: "Pérdida de grasa conservando músculo", protein: [2.3, 3.1] },
] as const;
export type TrainingLoad = (typeof TRAINING_LOADS)[number]["key"];
export type AthleteGoal = (typeof ATHLETE_GOALS)[number]["key"];

export function athleteTargets(weightKg: number, load: TrainingLoad, goal: AthleteGoal) {
  const l = TRAINING_LOADS.find((x) => x.key === load)!, g = ATHLETE_GOALS.find((x) => x.key === goal)!;
  const range = (r: readonly number[]) => ({ gkg: [r[0], r[1]], g: [Math.round(r[0] * weightKg), Math.round(r[1] * weightKg)] });
  return { carbs: range(l.carbs), protein: range(g.protein), fat: range([0.8, 1.5]), proteinPerMeal: [r1(0.25 * weightKg), r1(0.4 * weightKg)] };
}

/** Agua: 30–35 ml/kg/día (adultos). */
export const waterNeeds = (weightKg: number) => [Math.round(30 * weightKg), Math.round(35 * weightKg)];

// ---- Escalas para graficar rangos (zona por zona) ----
export type Tone = "bajo" | "normal" | "limite" | "alto";
export type Zone = { to: number; label: string; tone: Tone };
export type Scale = { min: number; max: number; unit: string; zones: Zone[] };

export const BMI_SCALE: Scale = {
  min: 14, max: 42, unit: "kg/m²", zones: [
    { to: 18.5, label: "Bajo peso", tone: "bajo" }, { to: 25, label: "Normal", tone: "normal" }, { to: 30, label: "Sobrepeso", tone: "limite" },
    { to: 35, label: "Obesidad I", tone: "alto" }, { to: 40, label: "Obesidad II", tone: "alto" }, { to: 42, label: "Obesidad III", tone: "alto" },
  ],
};
export const WHTR_SCALE: Scale = {
  min: 0.3, max: 0.8, unit: "", zones: [
    { to: 0.4, label: "Bajo", tone: "bajo" }, { to: 0.5, label: "Saludable", tone: "normal" }, { to: 0.6, label: "Riesgo elevado", tone: "limite" }, { to: 0.8, label: "Riesgo alto", tone: "alto" },
  ],
};

/** % de grasa corporal: rangos orientativos por sexo (ACE). */
export const bodyFatScale = (sex: Sex): Scale => (sex === "M"
  ? { min: 2, max: 40, unit: "%", zones: [{ to: 6, label: "Esencial", tone: "bajo" }, { to: 14, label: "Atlético", tone: "normal" }, { to: 18, label: "En forma", tone: "normal" }, { to: 25, label: "Aceptable", tone: "limite" }, { to: 40, label: "Elevado", tone: "alto" }] }
  : { min: 8, max: 48, unit: "%", zones: [{ to: 14, label: "Esencial", tone: "bajo" }, { to: 21, label: "Atlético", tone: "normal" }, { to: 25, label: "En forma", tone: "normal" }, { to: 32, label: "Aceptable", tone: "limite" }, { to: 48, label: "Elevado", tone: "alto" }] });

/** Índice cintura-cadera (OMS): riesgo si ≥ 0.90 (H) o ≥ 0.85 (M). */
export const whrScale = (sex: Sex): Scale => {
  const cut = sex === "M" ? 0.9 : 0.85;
  return { min: 0.6, max: 1.2, unit: "", zones: [{ to: cut - 0.05, label: "Bajo riesgo", tone: "normal" }, { to: cut, label: "Riesgo moderado", tone: "limite" }, { to: 1.2, label: "Riesgo alto", tone: "alto" }] };
};

/** Circunferencia de cintura (IDF, población latina): riesgo ≥ 90 cm (H) o ≥ 80 cm (M). */
export const waistScale = (sex: Sex): Scale => {
  const cut = sex === "M" ? 90 : 80;
  return { min: 50, max: 140, unit: "cm", zones: [{ to: cut, label: "Sin riesgo", tone: "normal" }, { to: cut + 12, label: "Riesgo aumentado", tone: "limite" }, { to: 140, label: "Riesgo muy aumentado", tone: "alto" }] };
};

/** Convierte un rango de referencia simple (mín–máx normal) en una escala graficable. */
export function rangeScale(low: number | undefined, high: number | undefined, unit: string): Scale {
  const lo = low ?? 0, hi = high ?? (low ?? 1) * 2;
  const span = Math.max(hi - lo, hi * 0.4, 1);
  const zones: Zone[] = [];
  if (low != null) zones.push({ to: low, label: "Bajo", tone: "bajo" });
  zones.push({ to: high ?? lo + span * 1.5, label: "Normal", tone: "normal" });
  if (high != null) zones.push({ to: hi + span, label: "Alto", tone: "alto" });
  return { min: Math.max(0, lo - span * (low != null ? 0.6 : 0)), max: zones[zones.length - 1].to, unit, zones };
}

export function zoneOf(scale: Scale, value: number): Zone {
  return scale.zones.find((z) => value < z.to) ?? scale.zones[scale.zones.length - 1];
}
