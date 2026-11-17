import { describe, expect, it } from "vitest";
import {
  athleteTargets, BMI_SCALE, describeMacros, evaluateFormula, macroBalance, moveMacro, moveMacroGkg, pregnancyPlan, rescaleForKcal,
  somatotype, toggleLock, validateFormula, zoneOf, type MacroState,
} from "./index";

const base: MacroState = { pct: { protein: 20, fat: 30, carbs: 50 }, locks: { protein: null, fat: null, carbs: null } };
const sum = (s: MacroState) => Math.round((s.pct.protein + s.pct.fat + s.pct.carbs) * 10) / 10;

describe("deslizadores de macros con candados", () => {
  it("sin candados: los otros dos se reparten la diferencia en proporción", () => {
    const s = moveMacro(base, "protein", 30);
    expect(s.pct.protein).toBe(30);
    expect(sum(s)).toBe(100);
    expect(s.pct.fat / s.pct.carbs).toBeCloseTo(30 / 50, 1);
  });
  it("con un candado: solo el libre absorbe la diferencia", () => {
    const s = moveMacro(toggleLock(base, "fat", "pct"), "protein", 28);
    expect(s.pct).toEqual({ protein: 28, fat: 30, carbs: 42 });
  });
  it("con dos candados: el macro se mueve solo y la suma se descuadra", () => {
    const locked = toggleLock(toggleLock(base, "fat", "pct"), "carbs", "pct");
    const s = moveMacro(locked, "protein", 25);
    expect(s.pct).toEqual({ protein: 25, fat: 30, carbs: 50 });
    const d = describeMacros(s, 2000, 70);
    expect(d.balanced).toBe(false);
    expect(d.unassignedKcal).toBe(-100);
  });
  it("no deja pasar de lo que permiten los bloqueados", () => {
    const s = moveMacro(toggleLock(base, "carbs", "pct"), "protein", 80);
    expect(s.pct).toEqual({ protein: 50, fat: 0, carbs: 50 });
  });
  it("mover en g/kg equivale a su porcentaje", () => {
    const s = moveMacroGkg(base, "protein", 1.8, 2000, 70); // 126 g = 504 kcal = 25.2 %
    expect(s.pct.protein).toBe(25.2);
    expect(describeMacros(s, 2000, 70).rows[0].gkg).toBe(1.8);
  });
  it("candado en gramos: al cambiar la energía conserva los g/kg", () => {
    const locked = toggleLock(moveMacroGkg(base, "protein", 1.8, 2000, 70), "protein", "g");
    const s = rescaleForKcal(locked, 2000, 1600);
    expect(describeMacros(s, 1600, 70).rows[0].g).toBeCloseTo(126, 0);
    expect(sum(s)).toBe(100);
    expect(s.pct.fat / s.pct.carbs).toBeCloseTo(locked.pct.fat / locked.pct.carbs, 1);
  });
  it("evalúa el equilibrio contra los rangos aceptables", () => {
    expect(macroBalance(base, 2000, 70).verdict).toBe("equilibrada");
    const keto = { ...base, pct: { protein: 20, fat: 75, carbs: 5 } };
    const b = macroBalance(keto, 2000, 70);
    expect(b.verdict).toBe("fuera_de_rango");
    expect(b.rows.find((r) => r.key === "fat")!.pctStatus).toBe("alto");
    expect(b.rows.find((r) => r.key === "carbs")!.pctStatus).toBe("bajo");
  });
});

describe("fórmulas propias (evaluador seguro)", () => {
  const v = { peso: 70, talla: 165, edad: 30, mlg: 50, hombre: 0, mujer: 1 };
  it("reproduce Mifflin-St Jeor escrita a mano", () => {
    expect(evaluateFormula("10*peso + 6.25*talla - 5*edad + 5*hombre - 161*mujer", v)).toBe(1420.25);
  });
  it("respeta precedencia, potencias, paréntesis y funciones", () => {
    expect(evaluateFormula("2 + 3 * 4", v)).toBe(14);
    expect(evaluateFormula("(2 + 3) * 4", v)).toBe(20);
    expect(evaluateFormula("2 ^ 3 ^ 2", v)).toBe(512);
    expect(evaluateFormula("-peso + max(10, 20)", v)).toBe(-50);
    expect(evaluateFormula("370 + 21,6 × mlg", v)).toBe(1450);
  });
  it("rechaza código y variables desconocidas", () => {
    for (const bad of ["process.exit()", "peso; alert(1)", "constructor", "peso + ", "1/0", "fetch('x')", "a => a", "peso[0]"]) {
      expect(validateFormula(bad)).not.toBeNull();
    }
    expect(validateFormula("peso * 25")).toBeNull();
  });
  it("avisa si falta un dato", () => expect(() => evaluateFormula("500 + 22*mlg", { peso: 70 })).toThrow(/mlg/));
});

describe("somatotipo Heath-Carter", () => {
  // Verificación a mano con las ecuaciones de Carter & Heath:
  //   X = (3.2 + 5.6 + 4.5) × 170.18 / 180 = 12.574 → endo = −0.7182 + 0.1451X − 0.00068X² + 0.0000014X³ = 1.00
  //   meso = 0.858×6.2 + 0.601×8.7 + 0.188×(23.3 − 0.32) + 0.161×(33.2 − 0.5) − 0.131×180 + 4.5 = 1.05
  //   HWR = 180 / ∛59.4 = 46.13 (≥ 40.75) → ecto = 0.732×46.13 − 28.58 = 5.19
  const s = somatotype({ heightCm: 180, weightKg: 59.4, triceps: 3.2, subscapular: 5.6, supraspinale: 4.5, calfSkinfold: 5, humerus: 6.2, femur: 8.7, armFlexed: 23.3, calf: 33.2 });
  it("coincide con el cálculo a mano", () => {
    expect(s.endo).toBe(1);
    expect(s.meso).toBe(1.1);
    expect(s.ecto).toBe(5.2);
    expect(s.hwr).toBe(46.13);
  });
  it("usa los tres tramos del índice ponderal para el ectomorfismo", () => {
    const at = (weightKg: number) => somatotype({ heightCm: 170, weightKg, triceps: 10, subscapular: 10, supraspinale: 10, calfSkinfold: 10, humerus: 6.5, femur: 9.5, armFlexed: 30, calf: 36 });
    expect(at(60).ecto).toBe(3.2);  // HWR 43.42 → 0.732×HWR − 28.58
    expect(at(80).ecto).toBe(0.6);  // HWR 39.45 → 0.463×HWR − 17.63
    expect(at(110).ecto).toBe(0.1); // HWR 35.48 → mínimo
  });
  it("clasifica y da coordenadas de la somatocarta", () => {
    expect(s.label).toMatch(/Ectomorfo/);
    expect(s.x).toBeCloseTo(s.ecto - s.endo, 1);
    expect(s.y).toBeCloseTo(2 * s.meso - (s.endo + s.ecto), 1);
  });
});

describe("embarazo, deporte y escalas", () => {
  it("ganancia de peso recomendada según IMC pregestacional (IOM)", () => {
    expect(pregnancyPlan(22, 60, 20)).toMatchObject({ category: "Peso normal", trimester: 2, totalGain: [11.5, 16], extraKcal: 340 });
    expect(pregnancyPlan(32, 85, 30)).toMatchObject({ category: "Obesidad", trimester: 3, totalGain: [5, 9], extraKcal: 452 });
    expect(pregnancyPlan(22, 60, 8).extraKcal).toBe(0);
  });
  it("metas del deportista en g/kg y gramos", () => {
    const t = athleteTargets(70, "alto", "hipertrofia");
    expect(t.carbs).toEqual({ gkg: [6, 10], g: [420, 700] });
    expect(t.protein).toEqual({ gkg: [1.6, 2.2], g: [112, 154] });
  });
  it("ubica un valor en su zona", () => {
    expect(zoneOf(BMI_SCALE, 22).label).toBe("Normal");
    expect(zoneOf(BMI_SCALE, 27.5).tone).toBe("limite");
    expect(zoneOf(BMI_SCALE, 60).label).toBe("Obesidad III");
  });
});
