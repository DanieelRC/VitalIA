import { describe, expect, it } from "vitest";
import { evidenceGuard } from "./evidence";

describe("candado contra datos inventados", () => {
  it("acepta cifras que el nutriólogo escribió (incluye talla en metros y coma decimal)", () => {
    const g = evidenceGuard("Mujer de 34 años, 78,5 kg y 1.60 m, actividad ligera");
    expect(g.check({ peso_kg: 78.5, talla_cm: 160, edad: 34 }, "mujer")).toBeUndefined();
  });
  it("rechaza lo que nadie dio", () => {
    const g = evidenceGuard("Calcula el gasto energético de un paciente de 80 kg");
    const r = g.check({ peso_kg: 80, talla_cm: 170, edad: 40 }, "hombre");
    expect(r?.error).toMatch(/talla \(170\)/);
    expect(r?.error).toMatch(/edad \(40\)/);
    expect(r?.error).toMatch(/sexo \(hombre\)/);
    expect(r?.error).not.toMatch(/peso/);
  });
  it("no confunde el sexo", () => {
    expect(evidenceGuard("mujer 30 años 60 kg 160 cm").check({ edad: 30 }, "hombre")?.error).toMatch(/sexo/);
    expect(evidenceGuard("paciente masculino de 30 años").check({ edad: 30 }, "hombre")).toBeUndefined();
  });
  it("acepta resultados de una herramienta anterior y miles con coma", () => {
    const g = evidenceGuard("Distribuye el GET con 20 % de proteína. Otro plan de 1,800 kcal.");
    expect(g.check({ kcal: 2137 })?.error).toMatch(/energía/);
    g.add(JSON.stringify({ resultados: [{ valor: "GEB 1449 kcal · GET 2137 kcal" }] }));
    expect(g.check({ kcal: 2137 })).toBeUndefined();
    expect(g.check({ kcal: 1800 })).toBeUndefined();
  });
  it("ignora los datos opcionales que no se enviaron", () => {
    expect(evidenceGuard("70 kg").check({ peso_kg: 70, met: undefined, minutos: undefined })).toBeUndefined();
  });
});

describe("unsupported", () => {
  it("lista las cifras de un borrador que no están en la evidencia", () => {
    const g = evidenceGuard("Peso 75.2 kg, IMC 29.5, glucosa 112 mg/dL");
    expect(g.unsupported("Peso 75.2 kg con IMC 29.5; glucosa 112 y colesterol 240. Camina 3 veces.")).toEqual([240]);
  });
});

