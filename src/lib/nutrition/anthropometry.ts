// Fórmulas antropométricas y de composición corporal. Unidades: kg, cm, pliegues en mm.
export type Sex = "M" | "F";

const r = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function bmi(weightKg: number, heightCm: number) {
  const m = heightCm / 100;
  return r(weightKg / (m * m), 1);
}

export function bmiCategory(v: number) {
  if (v < 18.5) return "Bajo peso";
  if (v < 25) return "Normal";
  if (v < 30) return "Sobrepeso";
  if (v < 35) return "Obesidad grado I";
  if (v < 40) return "Obesidad grado II";
  return "Obesidad grado III";
}

const inchesOver5ft = (heightCm: number) => Math.max(0, (heightCm - 152.4) / 2.54);

export const idealWeight = {
  lorentz: (h: number, sex: Sex) => r(h - 100 - (h - 150) / (sex === "M" ? 4 : 2)),
  hamwi: (h: number, sex: Sex) => r((sex === "M" ? 48 : 45.5) + (sex === "M" ? 2.7 : 2.2) * inchesOver5ft(h)),
  robinson: (h: number, sex: Sex) => r((sex === "M" ? 52 : 49) + (sex === "M" ? 1.9 : 1.7) * inchesOver5ft(h)),
  devine: (h: number, sex: Sex) => r((sex === "M" ? 50 : 45.5) + 2.3 * inchesOver5ft(h)),
  broca: (h: number) => r(h - 100),
  /** Peso para IMC objetivo (por defecto 22) */
  bmiTarget: (h: number, target = 22) => r(target * (h / 100) ** 2),
};

/** Peso ajustado para obesidad: PI + 0.25 (PA − PI) */
export const adjustedWeight = (actual: number, ideal: number, factor = 0.25) =>
  r(ideal + factor * (actual - ideal));

export const waistHipRatio = (waist: number, hip: number) => r(waist / hip, 2);
export const waistHipRisk = (ratio: number, sex: Sex) => (ratio > (sex === "M" ? 0.9 : 0.85) ? "Riesgo aumentado" : "Sin riesgo");

export const waistHeightRatio = (waist: number, heightCm: number) => r(waist / heightCm, 2);
export const waistHeightRisk = (v: number) => (v < 0.5 ? "Sin riesgo" : v < 0.6 ? "Riesgo aumentado" : "Riesgo alto");

export function frame(heightCm: number, wristCm: number, sex: Sex) {
  const v = heightCm / wristCm;
  const [small, medium] = sex === "M" ? [10.4, 9.6] : [11, 10.1];
  return { value: r(v, 1), label: v > small ? "Pequeña" : v >= medium ? "Mediana" : "Grande" };
}

// ---- Densidad corporal y % grasa ----

/** Durnin & Womersley (1974): suma de bíceps, tríceps, subescapular y suprailiaco. */
export function durninWomersleyDensity(sum4: number, age: number, sex: Sex) {
  const table: Record<Sex, [number, number, number][]> = {
    // [edad máx, c, m]
    M: [[19, 1.162, 0.063], [29, 1.1631, 0.0632], [39, 1.1422, 0.0544], [49, 1.162, 0.07], [Infinity, 1.1715, 0.0779]],
    F: [[19, 1.1549, 0.0678], [29, 1.1599, 0.0717], [39, 1.1423, 0.0632], [49, 1.1333, 0.0612], [Infinity, 1.1339, 0.0645]],
  };
  const [, c, m] = table[sex].find(([max]) => age <= max)!;
  return c - m * Math.log10(sum4);
}

/** Jackson & Pollock 3 pliegues. H: pecho, abdominal, muslo. M: tríceps, suprailiaco, muslo. */
export function jacksonPollock3Density(sum3: number, age: number, sex: Sex) {
  return sex === "M"
    ? 1.10938 - 0.0008267 * sum3 + 0.0000016 * sum3 ** 2 - 0.0002574 * age
    : 1.0994921 - 0.0009929 * sum3 + 0.0000023 * sum3 ** 2 - 0.0001392 * age;
}

/** Jackson & Pollock 7 pliegues: pecho, axilar, tríceps, subescapular, abdominal, suprailiaco, muslo. */
export function jacksonPollock7Density(sum7: number, age: number, sex: Sex) {
  return sex === "M"
    ? 1.112 - 0.00043499 * sum7 + 0.00000055 * sum7 ** 2 - 0.00028826 * age
    : 1.097 - 0.00046971 * sum7 + 0.00000056 * sum7 ** 2 - 0.00012828 * age;
}

export const siri = (density: number) => r((4.95 / density - 4.5) * 100);
export const brozek = (density: number) => r((4.57 / density - 4.142) * 100);

/** Slaughter (1988), niños y adolescentes 8-18 años: tríceps + pantorrilla. */
export const slaughterFat = (triceps: number, calf: number, sex: Sex) =>
  r(sex === "M" ? 0.735 * (triceps + calf) + 1.0 : 0.61 * (triceps + calf) + 5.1);

export function fatCategory(pct: number, sex: Sex) {
  const cuts = sex === "M" ? [6, 14, 18, 25] : [14, 21, 25, 32];
  const labels = ["Esencial", "Atlético", "Fitness", "Aceptable", "Obesidad"];
  return labels[cuts.filter((c) => pct >= c).length];
}

export function bodyComposition(weightKg: number, fatPct: number) {
  const fatKg = r((weightKg * fatPct) / 100);
  return { fatKg, leanKg: r(weightKg - fatKg) };
}

/** Lee et al. (2000) masa muscular esquelética. Circunferencias corregidas por pliegue. */
export function leeMuscleMass(p: {
  heightCm: number; age: number; sex: Sex;
  armCm: number; tricepsMm: number; thighCm: number; thighFoldMm: number; calfCm: number; calfFoldMm: number;
  race?: 0 | -2 | 1.1; // 0 blanco/hispano, -2 asiático, 1.1 afrodescendiente
}) {
  const corr = (circ: number, fold: number) => circ - Math.PI * (fold / 10);
  const cag = corr(p.armCm, p.tricepsMm);
  const ctg = corr(p.thighCm, p.thighFoldMm);
  const ccg = corr(p.calfCm, p.calfFoldMm);
  const ht = p.heightCm / 100;
  return r(ht * (0.00744 * cag ** 2 + 0.00088 * ctg ** 2 + 0.00441 * ccg ** 2) + 2.4 * (p.sex === "M" ? 1 : 0) - 0.048 * p.age + (p.race ?? 0) + 7.8);
}

/** Área muscular de brazo corregida (Heymsfield): (CB − π·PCT)² / 4π − 10 (H) / − 6.5 (M). cm² */
export function armMuscleArea(armCm: number, tricepsMm: number, sex: Sex) {
  const amb = (armCm - Math.PI * (tricepsMm / 10)) ** 2 / (4 * Math.PI);
  return { amb: r(amb), corrected: r(amb - (sex === "M" ? 10 : 6.5)) };
}

export function ageFromBirthDate(birth: string | Date, at: Date = new Date()) {
  const b = new Date(birth);
  let a = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) a--;
  return a;
}
