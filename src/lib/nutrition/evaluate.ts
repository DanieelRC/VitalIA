// Evaluación antropométrica completa a partir de una medición.
import {
  adjustedWeight, armMuscleArea, bmi, bmiCategory, bodyComposition, brozek, durninWomersleyDensity, fatCategory,
  frame, idealWeight, jacksonPollock3Density, jacksonPollock7Density, leeMuscleMass, siri, slaughterFat,
  waistHeightRatio, waistHeightRisk, waistHipRatio, waistHipRisk, type Sex,
} from "./anthropometry";

export type Measurement = {
  weight_kg?: number | null;
  height_cm?: number | null;
  circumferences?: Partial<Record<"cintura" | "cadera" | "brazo" | "pantorrilla" | "muslo" | "cuello" | "muneca", number>>;
  skinfolds?: Partial<Record<"triceps" | "biceps" | "subescapular" | "suprailiaco" | "abdominal" | "muslo" | "pecho" | "axilar" | "pantorrilla", number>>;
  bia?: Partial<Record<"grasa_pct" | "musculo_kg" | "agua_pct" | "visceral", number>>;
};

export type Evaluation = Record<string, { value: number | string; label?: string; method?: string }>;

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

export function evaluateMeasurement(m: Measurement, sex: Sex, age: number): Evaluation {
  const out: Evaluation = {};
  const w = n(m.weight_kg), h = n(m.height_cm);
  const c = m.circumferences ?? {}, s = m.skinfolds ?? {};

  if (w && h) {
    const v = bmi(w, h);
    out.imc = { value: v, label: bmiCategory(v), method: "OMS" };
    const pi = idealWeight.lorentz(h, sex);
    out.peso_ideal_lorentz = { value: pi, method: "Lorentz" };
    out.peso_ideal_hamwi = { value: idealWeight.hamwi(h, sex), method: "Hamwi" };
    out.peso_ideal_imc22 = { value: idealWeight.bmiTarget(h), method: "IMC 22" };
    if (v >= 30) out.peso_ajustado = { value: adjustedWeight(w, pi), method: "PI + 0.25 (PA − PI)" };
  }
  if (n(c.cintura) && n(c.cadera)) {
    const v = waistHipRatio(c.cintura!, c.cadera!);
    out.icc = { value: v, label: waistHipRisk(v, sex) };
  }
  if (n(c.cintura) && h) {
    const v = waistHeightRatio(c.cintura!, h);
    out.ice = { value: v, label: waistHeightRisk(v) };
  }
  if (n(c.muneca) && h) {
    const f = frame(h, c.muneca!, sex);
    out.complexion = { value: f.value, label: f.label };
  }

  // % de grasa: prioriza 7 pliegues > Durnin > 3 pliegues > Slaughter > BIA
  let fat: { pct: number; method: string } | undefined;
  const has = (...k: (keyof NonNullable<Measurement["skinfolds"]>)[]) => k.every((x) => n(s[x]));
  const sum = (...k: (keyof NonNullable<Measurement["skinfolds"]>)[]) => k.reduce((a, x) => a + (s[x] ?? 0), 0);

  if (age < 18 && has("triceps", "pantorrilla")) {
    fat = { pct: slaughterFat(s.triceps!, s.pantorrilla!, sex), method: "Slaughter" };
  } else if (has("pecho", "axilar", "triceps", "subescapular", "abdominal", "suprailiaco", "muslo")) {
    const d = jacksonPollock7Density(sum("pecho", "axilar", "triceps", "subescapular", "abdominal", "suprailiaco", "muslo"), age, sex);
    fat = { pct: siri(d), method: "Jackson-Pollock 7 + Siri" };
  } else if (has("biceps", "triceps", "subescapular", "suprailiaco")) {
    const d = durninWomersleyDensity(sum("biceps", "triceps", "subescapular", "suprailiaco"), age, sex);
    fat = { pct: siri(d), method: "Durnin-Womersley + Siri" };
    out.grasa_brozek = { value: brozek(d), method: "Durnin-Womersley + Brozek" };
  } else if (sex === "M" ? has("pecho", "abdominal", "muslo") : has("triceps", "suprailiaco", "muslo")) {
    const d = jacksonPollock3Density(sex === "M" ? sum("pecho", "abdominal", "muslo") : sum("triceps", "suprailiaco", "muslo"), age, sex);
    fat = { pct: siri(d), method: "Jackson-Pollock 3 + Siri" };
  } else if (n(m.bia?.grasa_pct)) {
    fat = { pct: m.bia!.grasa_pct!, method: "Bioimpedancia" };
  }
  if (fat) {
    out.grasa_pct = { value: fat.pct, label: fatCategory(fat.pct, sex), method: fat.method };
    if (w) {
      const bc = bodyComposition(w, fat.pct);
      out.masa_grasa_kg = { value: bc.fatKg };
      out.masa_libre_grasa_kg = { value: bc.leanKg };
    }
  }

  if (n(c.brazo) && n(s.triceps)) {
    const a = armMuscleArea(c.brazo!, s.triceps!, sex);
    out.amb = { value: a.corrected, method: "AMB corregida (cm²)" };
  }
  if (h && n(c.brazo) && n(s.triceps) && n(c.muslo) && n(s.muslo) && n(c.pantorrilla) && n(s.pantorrilla)) {
    out.masa_muscular_kg = {
      value: leeMuscleMass({
        heightCm: h, age, sex, armCm: c.brazo!, tricepsMm: s.triceps!, thighCm: c.muslo!, thighFoldMm: s.muslo!,
        calfCm: c.pantorrilla!, calfFoldMm: s.pantorrilla!,
      }),
      method: "Lee (2000)",
    };
  }
  return out;
}

export const evaluationLabels: Record<string, string> = {
  imc: "IMC (kg/m²)",
  peso_ideal_lorentz: "Peso ideal (kg)",
  peso_ideal_hamwi: "Peso ideal Hamwi (kg)",
  peso_ideal_imc22: "Peso para IMC 22 (kg)",
  peso_ajustado: "Peso ajustado (kg)",
  icc: "Índice cintura-cadera",
  ice: "Índice cintura-estatura",
  complexion: "Complexión (talla/muñeca)",
  grasa_pct: "Grasa corporal (%)",
  grasa_brozek: "Grasa corporal Brozek (%)",
  masa_grasa_kg: "Masa grasa (kg)",
  masa_libre_grasa_kg: "Masa libre de grasa (kg)",
  amb: "Área muscular de brazo (cm²)",
  masa_muscular_kg: "Masa muscular esquelética (kg)",
};
