// Aplica una plantilla de plan a otra energía: escala gramos de macros y equivalentes (a medias porciones).
type Meal = { name: string; kcal_pct: number; equivalents: Record<string, number> };
type Macros = { protein_g: number; fat_g: number; carbs_g: number; [k: string]: unknown };

const half = (n: number) => Math.round(n * 2) / 2;
const TOLERANCE = 0.03;

/**
 * @param groupKcal kcal por equivalente de cada grupo. Con este dato el escalado se corrige porción por porción
 *   hasta quedar a ±3 % de la energía pedida; sin él solo se escala en proporción.
 */
export function scaleTemplate<T extends { kcal_target: number; macros: Macros; meals: Meal[] }>(tpl: T, kcal: number, groupKcal?: Record<string, number>): T {
  const nominal = Number(tpl.kcal_target);
  if (!Number.isFinite(kcal) || kcal <= 0 || !Number.isFinite(nominal) || nominal <= 0) return tpl;
  const fMacros = kcal / nominal;
  const macros = {
    ...tpl.macros,
    protein_g: Math.round(tpl.macros.protein_g * fMacros * 10) / 10,
    fat_g: Math.round(tpl.macros.fat_g * fMacros * 10) / 10,
    carbs_g: Math.round(tpl.macros.carbs_g * fMacros * 10) / 10,
  };

  const energy = (meals: Meal[]) => meals.reduce((a, m) => a + Object.entries(m.equivalents ?? {}).reduce((s, [k, v]) => s + v * (groupKcal?.[k] ?? 0), 0), 0);
  // Se escala contra la energía real de los equivalentes de la plantilla, no contra su meta nominal
  const actual = groupKcal ? energy(tpl.meals) : 0;
  const f = actual > 0 ? kcal / actual : fMacros;
  if (Math.abs(f - 1) < 0.001) return { ...tpl, kcal_target: kcal, macros } as T;

  const meals: Meal[] = tpl.meals.map((m) => ({ ...m, equivalents: Object.fromEntries(Object.entries(m.equivalents ?? {}).map(([k, v]) => [k, half(v * f)])) }));

  if (groupKcal && actual > 0) {
    // Ajuste fino: quita o agrega media porción donde menos se nota (el grupo con más porciones en su comida)
    for (let i = 0; i < 400; i++) {
      const diff = energy(meals) - kcal;
      if (Math.abs(diff) <= kcal * TOLERANCE) break;
      const dir = diff > 0 ? -0.5 : 0.5;
      let best: { meal: Meal; code: string; score: number } | null = null;
      for (const meal of meals) {
        for (const [code, v] of Object.entries(meal.equivalents)) {
          const k = groupKcal[code] ?? 0;
          if (k <= 0 || (dir < 0 && v <= 0) || k * 0.5 > Math.abs(diff) * 1.5) continue;
          if (!best || v > best.score) best = { meal, code, score: v };
        }
      }
      if (!best) break;
      best.meal.equivalents[best.code] = best.meal.equivalents[best.code] + dir;
    }
  }
  for (const m of meals) m.equivalents = Object.fromEntries(Object.entries(m.equivalents).filter(([, v]) => v > 0));
  return { ...tpl, kcal_target: kcal, macros, meals } as T;
}
