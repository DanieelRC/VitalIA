// Cálculos con el Sistema Mexicano de Alimentos Equivalentes.
import type { Macros } from "./macros";

export type Group = { code: string; name: string; subgroup: string | null; kcal: number; protein_g: number; fat_g: number; carbs_g: number };
export type EquivalentCounts = Record<string, number>;

export function totalsFromEquivalents(counts: EquivalentCounts, groups: Group[]) {
  const t = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
  for (const g of groups) {
    const n = Number(counts[g.code] ?? 0);
    if (!n) continue;
    t.kcal += n * Number(g.kcal);
    t.protein_g += n * Number(g.protein_g);
    t.fat_g += n * Number(g.fat_g);
    t.carbs_g += n * Number(g.carbs_g);
  }
  return {
    kcal: Math.round(t.kcal),
    protein_g: Math.round(t.protein_g * 10) / 10,
    fat_g: Math.round(t.fat_g * 10) / 10,
    carbs_g: Math.round(t.carbs_g * 10) / 10,
  };
}

export function sumCounts(list: EquivalentCounts[]): EquivalentCounts {
  const out: EquivalentCounts = {};
  for (const c of list) for (const [k, v] of Object.entries(c)) out[k] = (out[k] ?? 0) + Number(v || 0);
  return out;
}

const half = (n: number) => Math.max(0, Math.round(n * 2) / 2);

/**
 * Sugerencia inicial de equivalentes diarios para cubrir los macros meta.
 * Fija verduras, frutas, leche y leguminosas según la energía y ajusta
 * proteína con AOA, hidratos con cereales y lípidos con grasas. Es un punto
 * de partida que el nutriólogo ajusta.
 */
export function suggestDailyEquivalents(kcal: number, target: Macros, groups: Group[]): EquivalentCounts {
  const g = Object.fromEntries(groups.map((x) => [x.code, x]));
  const counts: EquivalentCounts = {
    verduras: kcal < 1500 ? 4 : 5,
    frutas: kcal < 1500 ? 2 : kcal < 2200 ? 3 : 4,
    leche_d: kcal < 1500 ? 1 : 2,
    leguminosas: 1,
  };
  const remaining = () => {
    const t = totalsFromEquivalents(counts, groups);
    return { p: target.protein_g - t.protein_g, f: target.fat_g - t.fat_g, c: target.carbs_g - t.carbs_g };
  };
  // Iterar porque cada grupo aporta a varios macros
  for (let i = 0; i < 4; i++) {
    let rem = remaining();
    counts.aoa_b = half((counts.aoa_b ?? 0) + rem.p / Number(g.aoa_b?.protein_g ?? 7) * 0.6);
    counts.aoa_mb = half((counts.aoa_mb ?? 0) + rem.p / Number(g.aoa_mb?.protein_g ?? 7) * 0.4);
    rem = remaining();
    counts.cereales_sg = half((counts.cereales_sg ?? 0) + rem.c / Number(g.cereales_sg?.carbs_g ?? 15));
    rem = remaining();
    counts.grasas_sp = half((counts.grasas_sp ?? 0) + rem.f / Number(g.grasas_sp?.fat_g ?? 5) * 0.7);
    counts.grasas_cp = half((counts.grasas_cp ?? 0) + rem.f / Number(g.grasas_cp?.fat_g ?? 5) * 0.3);
  }
  return Object.fromEntries(Object.entries(counts).filter(([, v]) => v > 0));
}

/** Reparte los equivalentes diarios entre tiempos de comida según el % de kcal (redondeo a 0.5). */
export function splitEquivalentsByMeals(daily: EquivalentCounts, meals: { kcal_pct: number }[]): EquivalentCounts[] {
  const out = meals.map(() => ({}) as EquivalentCounts);
  for (const [code, total] of Object.entries(daily)) {
    let assigned = 0;
    meals.forEach((m, i) => {
      const v = i === meals.length - 1 ? total - assigned : half((total * m.kcal_pct) / 100);
      out[i][code] = Math.max(0, v);
      assigned += out[i][code];
    });
  }
  return out;
}
