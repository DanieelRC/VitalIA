import { describe, expect, it } from "vitest";
import {
  adequacy, basalEnergy, bmi, durninWomersleyDensity, evaluateMeasurement, frame, idealWeight, jacksonPollock3Density,
  karvonen, macrosFromGkg, macrosFromPct, metKcal, siri, splitEquivalentsByMeals, suggestDailyEquivalents,
  totalEnergy, totalsFromEquivalents, type Group,
} from ".";

const groups: Group[] = [
  ["verduras", 25, 2, 0, 4], ["frutas", 60, 0, 0, 15], ["cereales_sg", 70, 2, 0, 15], ["leguminosas", 120, 8, 1, 20],
  ["aoa_mb", 40, 7, 1, 0], ["aoa_b", 55, 7, 3, 0], ["leche_d", 95, 9, 2, 12], ["grasas_sp", 45, 0, 5, 0], ["grasas_cp", 70, 3, 5, 3],
].map(([code, kcal, protein_g, fat_g, carbs_g]) => ({ code, name: String(code), subgroup: null, kcal, protein_g, fat_g, carbs_g }) as Group);

describe("antropometría", () => {
  it("IMC", () => expect(bmi(70, 170)).toBe(24.2));
  it("peso ideal Lorentz", () => {
    expect(idealWeight.lorentz(170, "M")).toBe(65);
    expect(idealWeight.lorentz(160, "F")).toBe(55);
  });
  it("complexión", () => expect(frame(170, 17, "M")).toEqual({ value: 10, label: "Mediana" }));
  it("Durnin-Womersley + Siri: hombre 25 años, suma 40 mm", () => {
    const d = durninWomersleyDensity(40, 25, "M"); // 1.1631 − 0.0632·log10(40) = 1.06185
    expect(d).toBeCloseTo(1.06185, 4);
    expect(siri(d)).toBeCloseTo(16.2, 1);
  });
  it("Jackson-Pollock 3 mujer", () => {
    const d = jacksonPollock3Density(60, 30, "F"); // 1.0994921 − 0.059574 + 0.00828 − 0.004176
    expect(d).toBeCloseTo(1.044022, 5);
  });
  it("evaluación completa elige método disponible", () => {
    const e = evaluateMeasurement(
      { weight_kg: 80, height_cm: 175, circumferences: { cintura: 90, cadera: 100 }, skinfolds: { biceps: 8, triceps: 12, subescapular: 15, suprailiaco: 18 } },
      "M", 35,
    );
    expect(e.imc.value).toBe(26.1);
    expect(e.icc.value).toBe(0.9);
    expect(e.grasa_pct.method).toContain("Durnin");
    expect(e.masa_libre_grasa_kg).toBeDefined();
  });
});

describe("gasto energético", () => {
  const p = { weightKg: 70, heightCm: 175, age: 30, sex: "M" as const };
  it("Mifflin-St Jeor", () => expect(basalEnergy("mifflin", p)).toBe(1649)); // 700 + 1093.75 − 150 + 5
  it("Harris-Benedict", () => expect(basalEnergy("harris_benedict", p)).toBe(1702));
  it("FAO/OMS 30-60", () => expect(basalEnergy("fao_oms", p)).toBe(1691)); // 11.6·70 + 879
  it("Valencia mujer 18-30", () => expect(basalEnergy("valencia", { ...p, sex: "F", age: 25 })).toBe(1450));
  it("Katch-McArdle", () => expect(basalEnergy("katch_mcardle", { ...p, leanKg: 60 })).toBe(1666));
  it("GET con FA y ETA", () => expect(totalEnergy({ geb: 1600, activity: 1.55, etaPct: 10 })).toBe(2640));
});

describe("macros y equivalentes", () => {
  it("por porcentaje", () => expect(macrosFromPct(2000, { protein_pct: 20, fat_pct: 30, carbs_pct: 50 }))
    .toEqual({ protein_g: 100, fat_g: 66.7, carbs_g: 250 }));
  it("por g/kg", () => expect(macrosFromGkg(2000, 70, 2, 1)).toEqual({ protein_g: 140, fat_g: 70, carbs_g: 202.5 }));
  it("totales de equivalentes", () =>
    expect(totalsFromEquivalents({ cereales_sg: 2, aoa_mb: 3 }, groups)).toEqual({ kcal: 260, protein_g: 25, fat_g: 3, carbs_g: 30 }));
  it("adecuación", () => {
    expect(adequacy(98, 100)).toEqual({ pct: 98, ok: true });
    expect(adequacy(110, 100).ok).toBe(false);
  });
  it("sugerencia de equivalentes se acerca a la meta (±10 %)", () => {
    const target = macrosFromPct(1800, { protein_pct: 20, fat_pct: 30, carbs_pct: 50 });
    const t = totalsFromEquivalents(suggestDailyEquivalents(1800, target, groups), groups);
    expect(Math.abs(t.kcal - 1800) / 1800).toBeLessThan(0.1);
  });
  it("reparto por tiempos conserva el total", () => {
    const split = splitEquivalentsByMeals({ cereales_sg: 7 }, [{ kcal_pct: 30 }, { kcal_pct: 40 }, { kcal_pct: 30 }]);
    expect(split.reduce((a, m) => a + m.cereales_sg, 0)).toBe(7);
  });
});

describe("ejercicio", () => {
  it("Karvonen", () => expect(karvonen(190, 60, 70)).toBe(151));
  it("MET", () => expect(metKcal(8, 70, 30)).toBe(294));
});
