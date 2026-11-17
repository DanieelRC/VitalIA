import { describe, expect, it } from "vitest";
import { calcAthlete, calcEnergy, calcEquivalents, calcExercise, calcLabs, calcMacros, calcPregnancy } from "./calc";

const val = (r: { resultados: { etiqueta: string; valor: string }[] }, label: RegExp) => r.resultados.find((x) => label.test(x.etiqueta))?.valor ?? "";

describe("herramientas de cálculo del asistente", () => {
  it("gasto energético: Mifflin a mano (10·78 + 6.25·160 − 5·34 − 161 = 1449)", () => {
    const r = calcEnergy({ sexo: "mujer", peso_kg: 78, talla_cm: 160, edad: 34, formulas: ["mifflin"], factor_actividad: 1.375 });
    // GET = 1449 × 1.375 + 10 % de 1449 = 1992.4 + 144.9 = 2137
    expect(val(r, /Mifflin/)).toBe("GEB 1449 kcal · GET 2137 kcal");
    expect(r.avisos).toEqual([]);
  });
  it("avisa cuando no se indicó actividad y cuando falta la masa libre de grasa", () => {
    const r = calcEnergy({ sexo: "hombre", peso_kg: 80, talla_cm: 175, edad: 40 });
    expect(r.avisos!.join(" ")).toMatch(/sedentario/);
    expect(r.avisos!.join(" ")).toMatch(/masa libre de grasa/);
    expect(r.resultados.some((x) => /Katch/.test(x.etiqueta))).toBe(false);
  });
  it("incluye las fórmulas propias del consultorio", () => {
    const r = calcEnergy({ sexo: "mujer", peso_kg: 60, talla_cm: 160, edad: 30, formulas: ["mifflin"], factor_actividad: 1.2, propias: [{ name: "Rápida", expression: "peso * 25" }] });
    expect(val(r, /Rápida/)).toMatch(/^GEB 1500 kcal/);
  });
  it("macros en porcentaje: 2000 kcal 20/30/50 → 100 g, 66.7 g, 250 g", () => {
    const r = calcMacros({ kcal: 2000, peso_kg: 80, unidad: "porcentaje", proteina: 20, lipidos: 30, hidratos: 50 });
    expect(val(r, /Proteína/)).toMatch(/^100 g · 20 % · 1.25 g\/kg · 400 kcal/);
    expect(val(r, /Lípidos/)).toMatch(/^66.7 g · 30 %/);
    expect(val(r, /Hidratos/)).toMatch(/^250 g · 50 %/);
    expect(val(r, /Valoración/)).toMatch(/Equilibrada/);
  });
  it("macros en g/kg: los hidratos completan la energía y se marca lo que sale de rango", () => {
    // 70 kg · 2.5 g/kg proteína = 175 g = 700 kcal = 38.9 % (alto); lípidos 1 g/kg = 70 g = 630 kcal = 35 %
    const r = calcMacros({ kcal: 1800, peso_kg: 70, unidad: "g_por_kg", proteina: 2.5, lipidos: 1 });
    const p = r.resultados.find((x) => x.etiqueta === "Proteína")!;
    expect(p.valor).toMatch(/^175 g · 38.9 %/);
    expect(p.estado).toBe("alto");
    expect(val(r, /Valoración/)).toMatch(/Fuera/);
  });
  it("macros que no suman 100 % se avisan", () => {
    const r = calcMacros({ kcal: 2000, unidad: "porcentaje", proteina: 20, lipidos: 30, hidratos: 40 });
    expect(r.avisos!.join(" ")).toMatch(/suman 90 %.*faltan 200 kcal/);
  });
  it("ejercicio: Tanaka 208 − 0.7·45 = 176.5 → 177; MET 8 × 3.5 × 70 ÷ 200 × 30 = 294 kcal", () => {
    const r = calcExercise({ edad: 45, fc_reposo: 62, peso_kg: 70, met: 8, minutos: 30 });
    expect(val(r, /Tanaka/)).toMatch(/^17[67] lpm/);
    expect(val(r, /220/)).toBe("175 lpm");
    expect(val(r, /Gasto/)).toBe("294 kcal");
    expect(r.resultados.filter((x) => /^Zona/.test(x.etiqueta)).length).toBeGreaterThanOrEqual(4);
  });
  it("laboratorios: marca fuera de rango y rechaza analitos desconocidos", () => {
    const r = calcLabs({ glucosa: 118, hdl: 35, colesterol: 180, inventado: 3 });
    expect(r.resultados.find((x) => /Glucosa/.test(x.etiqueta))!.estado).toBe("alto");
    expect(r.resultados.find((x) => /HDL/.test(x.etiqueta))!.estado).toBe("bajo");
    expect(r.resultados.find((x) => /Colesterol/.test(x.etiqueta))!.estado).toBe("normal");
    expect(r.avisos!.join(" ")).toMatch(/"inventado" no está/);
  });
  it("embarazo: IMC 23.4 → peso normal, 11.5–16 kg y +340 kcal en el 2.º trimestre", () => {
    const r = calcPregnancy({ peso_pregestacional_kg: 60, talla_cm: 160, semana: 20, peso_actual_kg: 64 });
    expect(val(r, /Ganancia total/)).toBe("11.5–16 kg");
    expect(val(r, /Energía adicional/)).toBe("+340 kcal/día");
    expect(r.resultados.find((x) => /Ganancia actual/.test(x.etiqueta))!.estado).toBe("normal"); // esperado 3–5.5 kg
  });
  it("deportista: 70 kg, carga alta, hipertrofia", () => {
    const r = calcAthlete({ peso_kg: 70, carga: "alto", objetivo: "hipertrofia" });
    expect(val(r, /Hidratos/)).toBe("6–10 g/kg · 420–700 g/día");
    expect(val(r, /^Proteína$/)).toBe("1.6–2.2 g/kg · 112–154 g/día");
  });
  it("equivalentes: la propuesta queda cerca de la meta y se reparte por tiempos", () => {
    const groups = [
      { code: "verduras", name: "Verduras", subgroup: null, kcal: 25, protein_g: 2, fat_g: 0, carbs_g: 4 },
      { code: "frutas", name: "Frutas", subgroup: null, kcal: 60, protein_g: 0, fat_g: 0, carbs_g: 15 },
      { code: "cereales_sg", name: "Cereales", subgroup: "sin grasa", kcal: 70, protein_g: 2, fat_g: 0, carbs_g: 15 },
      { code: "leguminosas", name: "Leguminosas", subgroup: null, kcal: 120, protein_g: 8, fat_g: 1, carbs_g: 20 },
      { code: "aoa_b", name: "Origen animal", subgroup: "bajo en grasa", kcal: 55, protein_g: 7, fat_g: 3, carbs_g: 0 },
      { code: "aoa_mb", name: "Origen animal", subgroup: "muy bajo en grasa", kcal: 40, protein_g: 7, fat_g: 1, carbs_g: 0 },
      { code: "leche_d", name: "Leche", subgroup: "descremada", kcal: 95, protein_g: 9, fat_g: 2, carbs_g: 12 },
      { code: "grasas_sp", name: "Aceites y grasas", subgroup: "sin proteína", kcal: 45, protein_g: 0, fat_g: 5, carbs_g: 0 },
      { code: "grasas_cp", name: "Aceites y grasas", subgroup: "con proteína", kcal: 70, protein_g: 3, fat_g: 5, carbs_g: 3 },
    ];
    const r = calcEquivalents({ kcal: 1800, proteina_g: 90, lipidos_g: 60, hidratos_g: 225, tiempos: [{ nombre: "Desayuno", porcentaje: 30 }, { nombre: "Comida", porcentaje: 40 }, { nombre: "Cena", porcentaje: 30 }] }, groups);
    const pct = Number(val(r, /Adecuación · energía/).match(/\(([0-9.]+) %\)/)![1]);
    expect(pct).toBeGreaterThanOrEqual(85);
    expect(pct).toBeLessThanOrEqual(115);
    expect(r.resultados.filter((x) => /Desayuno|Comida|Cena/.test(x.etiqueta))).toHaveLength(3);
  });
});

describe("copiloto: unidades mezcladas y energía objetivo", () => {
  it("acepta proteína en g/kg con lípidos en porcentaje", () => {
    const c = calcMacros({ kcal: 1696, peso_kg: 75.2, unidad: "g_por_kg", unidad_lipidos: "porcentaje", proteina: 1.6, lipidos: 30 });
    expect(c.resultados[0].valor).toContain("120.3 g");
    expect(c.resultados[1].valor).toContain("30 %");
    expect(c.resultados[3].valor).not.toContain("No suma");
  });
  it("rechaza g/kg implausibles en vez de calcular", () => {
    expect(calcMacros({ kcal: 1696, peso_kg: 75.2, unidad: "g_por_kg", proteina: 1.6, lipidos: 30 }).resultados).toHaveLength(0);
  });
  it("muestra la energía objetivo aparte del GET cuando hay ajuste", () => {
    const c = calcEnergy({ sexo: "mujer", peso_kg: 75.2, talla_cm: 160, edad: 34, formulas: ["mifflin"], factor_actividad: 1.375, ajuste_kcal: -400 });
    expect(c.resultados[0].valor).toMatch(/GET 2096 kcal · energía objetivo 1696 kcal/);
  });
});

