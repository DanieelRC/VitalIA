// Distribución de macronutrientes y reparto por tiempos de comida.
export const KCAL = { protein: 4, fat: 9, carbs: 4 } as const;

export type Macros = { protein_g: number; fat_g: number; carbs_g: number };
export type MacroPct = { protein_pct: number; fat_pct: number; carbs_pct: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

export function macrosFromPct(kcal: number, pct: MacroPct): Macros {
  return {
    protein_g: r1((kcal * pct.protein_pct) / 100 / KCAL.protein),
    fat_g: r1((kcal * pct.fat_pct) / 100 / KCAL.fat),
    carbs_g: r1((kcal * pct.carbs_pct) / 100 / KCAL.carbs),
  };
}

/** Proteína y grasa en g/kg; los hidratos completan la energía restante. */
export function macrosFromGkg(kcal: number, weightKg: number, proteinGkg: number, fatGkg: number): Macros {
  const protein_g = r1(proteinGkg * weightKg);
  const fat_g = r1(fatGkg * weightKg);
  const rest = kcal - protein_g * KCAL.protein - fat_g * KCAL.fat;
  return { protein_g, fat_g, carbs_g: r1(Math.max(0, rest) / KCAL.carbs) };
}

export function pctFromMacros(m: Macros): MacroPct & { kcal: number } {
  const kcal = m.protein_g * 4 + m.fat_g * 9 + m.carbs_g * 4;
  if (!kcal) return { kcal: 0, protein_pct: 0, fat_pct: 0, carbs_pct: 0 };
  return {
    kcal: Math.round(kcal),
    protein_pct: r1((m.protein_g * 4 * 100) / kcal),
    fat_pct: r1((m.fat_g * 9 * 100) / kcal),
    carbs_pct: r1((m.carbs_g * 4 * 100) / kcal),
  };
}

export const macroPresets: { key: string; label: string; pct: MacroPct; note?: string }[] = [
  { key: "equilibrada", label: "Equilibrada", pct: { protein_pct: 20, fat_pct: 30, carbs_pct: 50 } },
  { key: "hipocalorica", label: "Hipocalórica alta en proteína", pct: { protein_pct: 30, fat_pct: 30, carbs_pct: 40 } },
  { key: "alta_proteina", label: "Alta en proteína (deportiva)", pct: { protein_pct: 30, fat_pct: 25, carbs_pct: 45 } },
  { key: "baja_hc", label: "Baja en hidratos", pct: { protein_pct: 30, fat_pct: 40, carbs_pct: 30 } },
  { key: "cetogenica", label: "Cetogénica", pct: { protein_pct: 20, fat_pct: 75, carbs_pct: 5 }, note: "< 50 g HC/día; requiere supervisión." },
  { key: "dash", label: "DASH (hipertensión)", pct: { protein_pct: 18, fat_pct: 27, carbs_pct: 55 }, note: "Sodio < 2,300 mg (ideal 1,500 mg)." },
  { key: "diabetes", label: "Diabetes", pct: { protein_pct: 20, fat_pct: 30, carbs_pct: 50 }, note: "HC de bajo índice glucémico, distribuidos en el día." },
  { key: "renal", label: "Renal (ERC sin diálisis)", pct: { protein_pct: 10, fat_pct: 30, carbs_pct: 60 }, note: "Proteína 0.55-0.8 g/kg; ajustar K y P." },
  { key: "deportiva_resistencia", label: "Deportiva de resistencia", pct: { protein_pct: 15, fat_pct: 25, carbs_pct: 60 } },
];

export const mealDistributionPresets: { key: string; label: string; meals: { name: string; kcal_pct: number }[] }[] = [
  { key: "3", label: "3 tiempos", meals: [{ name: "Desayuno", kcal_pct: 30 }, { name: "Comida", kcal_pct: 40 }, { name: "Cena", kcal_pct: 30 }] },
  {
    key: "4", label: "4 tiempos",
    meals: [{ name: "Desayuno", kcal_pct: 25 }, { name: "Colación", kcal_pct: 10 }, { name: "Comida", kcal_pct: 40 }, { name: "Cena", kcal_pct: 25 }],
  },
  {
    key: "5", label: "5 tiempos",
    meals: [
      { name: "Desayuno", kcal_pct: 25 }, { name: "Colación matutina", kcal_pct: 10 }, { name: "Comida", kcal_pct: 35 },
      { name: "Colación vespertina", kcal_pct: 10 }, { name: "Cena", kcal_pct: 20 },
    ],
  },
  {
    key: "6", label: "6 tiempos",
    meals: [
      { name: "Desayuno", kcal_pct: 20 }, { name: "Colación matutina", kcal_pct: 10 }, { name: "Comida", kcal_pct: 30 },
      { name: "Colación vespertina", kcal_pct: 10 }, { name: "Cena", kcal_pct: 20 }, { name: "Colación nocturna", kcal_pct: 10 },
    ],
  },
];

/** Reparte energía y macros proporcionalmente al % de kcal de cada tiempo. */
export function distributeMeals(kcal: number, macros: Macros, meals: { name: string; kcal_pct: number }[]) {
  return meals.map((m) => ({
    ...m,
    kcal: Math.round((kcal * m.kcal_pct) / 100),
    protein_g: r1((macros.protein_g * m.kcal_pct) / 100),
    fat_g: r1((macros.fat_g * m.kcal_pct) / 100),
    carbs_g: r1((macros.carbs_g * m.kcal_pct) / 100),
  }));
}

/** % de adecuación (obtenido / meta). Adecuado entre 95 y 105 %. */
export function adequacy(obtained: number, target: number) {
  if (!target) return { pct: 0, ok: false };
  const pct = Math.round((obtained / target) * 1000) / 10;
  return { pct, ok: pct >= 95 && pct <= 105 };
}
