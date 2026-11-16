import { describe, expect, it } from "vitest";
import { classifyAlerts } from "./alerts";
import { packageBalance, totalPaid } from "./payments";
import { labFlag } from "./nutrition/labs";
import { scaleTemplate } from "./nutrition/templates";
import { dueReminders, isValidTime } from "./reminders";
import { buildShoppingList, familyOf, parseQuantity } from "./shopping";

const foods = [
  { name: "Avena en hojuelas", group_code: "cereales_sg" }, { name: "Plátano", group_code: "frutas" },
  { name: "Pechuga de pollo sin piel", group_code: "aoa_mb" }, { name: "Espinaca cruda", group_code: "verduras" },
  { name: "Aceite de oliva", group_code: "grasas_sp" }, { name: "Leche descremada", group_code: "leche_d" },
];

describe("lista del súper", () => {
  it("asigna familia por el alimento principal", () => {
    expect(familyOf("Plátanos maduros", foods)).toBe("frutas");
    expect(familyOf("Pechuga de pollo", foods)).toBe("aoa");
    expect(familyOf("Avena", foods)).toBe("cereales");
    expect(familyOf("Sal de mar", foods)).toBe("otros");
  });
  it("suma el mismo ingrediente entre recetas y por veces en la semana", () => {
    const list = buildShoppingList([
      { ingredients: [{ name: "Avena", quantity: 40, unit: "g" }, { name: "Plátano", quantity: 1, unit: "pieza" }], servings: 1, times: 3 },
      { ingredients: [{ name: "avena", quantity: 60, unit: "g" }, { name: "Canela", quantity: "al gusto", unit: "" }], servings: 2, times: 1 },
    ], foods);
    const avena = list.find((i) => i.key === "avena|g")!;
    expect(avena.quantity).toBe(150); // 40×3 + 60/2
    expect(avena.family).toBe("cereales");
    expect(list.find((i) => i.name === "Plátano")!.quantity).toBe(3);
    expect(list.find((i) => i.name === "Canela")!.quantity).toBeNull();
  });
  it("entiende fracciones y junta singular con plural", () => {
    expect(parseQuantity("1/2")).toBe(0.5);
    expect(parseQuantity("1 1/2")).toBe(1.5);
    expect(parseQuantity("al gusto")).toBeNaN();
    const list = buildShoppingList([
      { ingredients: [{ name: "Tortilla de maíz", quantity: "2", unit: "piezas" }, { name: "Aguacate", quantity: "1/3", unit: "pieza" }], servings: 1, times: 2 },
      { ingredients: [{ name: "Tortilla de maíz", quantity: "1", unit: "pieza" }], servings: 1, times: 1 },
    ], foods);
    const t = list.find((i) => i.name === "Tortilla de maíz")!;
    expect([t.quantity, t.unit]).toEqual([5, "piezas"]);
    const a = list.find((i) => i.name === "Aguacate")!;
    expect([a.quantity, a.unit]).toEqual([0.7, "pieza"]);
  });
});

describe("recordatorios", () => {
  const prefs = { meals: [{ label: "Desayuno", time: "08:00" }, { label: "Cena", time: "20:30" }], water: true, weigh_day: 1 };
  const at = (h: number, m: number, weekday = 3) => ({ date: "2026-11-18", minutes: h * 60 + m, weekday });
  it("avisa la comida solo dentro de su ventana", () => {
    expect(dueReminders(prefs, at(8, 5)).map((r) => r.key)).toEqual(["2026-11-18-comida-08:00"]);
    expect(dueReminders(prefs, at(8, 20))).toHaveLength(0);
    expect(dueReminders(prefs, at(7, 55))).toHaveLength(0);
  });
  it("agua cada 2 h de 10 a 20 y peso el día elegido a las 8", () => {
    expect(dueReminders(prefs, at(12, 0)).map((r) => r.key)).toEqual(["2026-11-18-agua-12"]);
    expect(dueReminders({ ...prefs, water: false }, at(12, 0))).toHaveLength(0);
    expect(dueReminders(prefs, at(8, 0, 1)).map((r) => r.key)).toContain("2026-11-18-peso");
    expect(dueReminders(prefs, at(8, 0, 2)).map((r) => r.key)).not.toContain("2026-11-18-peso");
  });
  it("las llaves son únicas por día (no se repite el aviso)", () => {
    expect(dueReminders(prefs, at(20, 30))[0].key).toBe(dueReminders(prefs, at(20, 44))[0].key);
  });
  it("valida horas", () => { expect(isValidTime("07:30")).toBe(true); expect(isValidTime("25:00")).toBe(false); expect(isValidTime("x")).toBe(false); });
});

describe("laboratorios", () => {
  it("marca fuera de rango", () => {
    expect(labFlag("glucosa", 92)).toBe("normal");
    expect(labFlag("glucosa", 130)).toBe("alto");
    expect(labFlag("hdl", 35)).toBe("bajo");
    expect(labFlag("hba1c", 5.6)).toBe("normal");
    expect(labFlag("hba1c", 6.5)).toBe("alto");
    expect(labFlag("desconocido", 1)).toBeNull();
  });
});

describe("alertas de seguimiento", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const days = (n: number) => new Date(now.getTime() - n * 864e5).toISOString();
  const patients = [
    { id: "a", full_name: "Ana", user_id: "ua", activated_at: days(40) },
    { id: "b", full_name: "Beto", user_id: "ub", activated_at: days(40) },
    { id: "c", full_name: "Caro", user_id: "uc", activated_at: days(3) },   // recién activada: no cuenta como inactiva
    { id: "d", full_name: "Dani", user_id: null, activated_at: null },      // sin cuenta
  ];
  const alerts = classifyAlerts({
    now, patients,
    activity: [{ patient_id: "a", at: days(2) }, { patient_id: "b", at: days(20) }],
    adherence: [{ patient_id: "a", logged_at: "2026-11-13", adherence: 2 }, { patient_id: "a", logged_at: "2026-11-06", adherence: 1 }],
    flagged: [{ user_id: "ub", reason: "eating_disorder", at: days(1) }],
    pendingPhotos: [{ patient_id: "a" }, { patient_id: "a" }],
  });
  const of = (id: string) => alerts.filter((x) => x.patientId === id).map((x) => x.kind);
  it("detecta apego bajo y fotos pendientes", () => expect(of("a")).toEqual(["apego", "fotos"]));
  it("detecta alarma e inactividad", () => expect(of("b")).toEqual(["alarma", "inactivo"]));
  it("no marca a quien acaba de activar su cuenta ni a quien no tiene cuenta", () => { expect(of("c")).toEqual([]); expect(of("d")).toEqual([]); });
  it("ordena las alarmas primero", () => expect(alerts[0].kind).toBe("alarma"));
});

describe("pagos y paquetes", () => {
  const pays = [
    { kind: "paquete", method: "transferencia", amount: 2400, sessions: 4 },
    { kind: "consulta", method: "paquete", amount: 0, sessions: null },
    { kind: "consulta", method: "paquete", amount: 0, sessions: null },
    { kind: "consulta", method: "efectivo", amount: 700, sessions: null },
  ];
  it("calcula sesiones disponibles y total", () => {
    expect(packageBalance(pays)).toEqual({ bought: 4, used: 2, left: 2 });
    expect(totalPaid(pays)).toBe(3100);
  });
});

describe("plantillas de plan", () => {
  const tpl = { kcal_target: 2000, macros: { protein_g: 100, fat_g: 67, carbs_g: 250 }, meals: [{ name: "Comida", kcal_pct: 100, equivalents: { cereales_sg: 3, verduras: 2, grasas_sp: 0.5 } }] };
  it("escala macros y equivalentes a medias porciones", () => {
    const s = scaleTemplate(tpl, 1600);
    expect(s.kcal_target).toBe(1600);
    expect(s.macros.protein_g).toBe(80);
    expect(s.meals[0].equivalents).toEqual({ cereales_sg: 2.5, verduras: 1.5, grasas_sp: 0.5 });
  });
  it("misma energía no cambia nada", () => expect(scaleTemplate(tpl, 2000).meals).toEqual(tpl.meals));
  it("con las kcal de cada grupo queda a ±3 % de la energía pedida, aunque la plantilla no cuadrara", () => {
    const groupKcal: Record<string, number> = { cereales_sg: 70, verduras: 25, grasas_sp: 45, aoa_b: 55, frutas: 60, leche_d: 95 };
    const big: { kcal_target: number; macros: { protein_g: number; fat_g: number; carbs_g: number }; meals: { name: string; kcal_pct: number; equivalents: Record<string, number> }[] } = {
      kcal_target: 1800, // meta nominal distinta de lo que realmente suman sus equivalentes (≈2060)
      macros: { protein_g: 90, fat_g: 60, carbs_g: 225 },
      meals: [
        { name: "Desayuno", kcal_pct: 30, equivalents: { cereales_sg: 3, frutas: 1, leche_d: 1, aoa_b: 1, grasas_sp: 2 } },
        { name: "Comida", kcal_pct: 40, equivalents: { cereales_sg: 4, verduras: 2, aoa_b: 3, grasas_sp: 3, frutas: 1 } },
        { name: "Cena", kcal_pct: 30, equivalents: { cereales_sg: 3, verduras: 1, aoa_b: 2, grasas_sp: 2, leche_d: 1, frutas: 1 } },
      ],
    };
    const total = (t: typeof big) => t.meals.reduce((a, m) => a + Object.entries(m.equivalents).reduce((s, [k, v]) => s + v * groupKcal[k], 0), 0);
    for (const target of [1200, 1500, 2400]) {
      const s = scaleTemplate(big, target, groupKcal);
      expect(Math.abs(total(s) - target) / target).toBeLessThanOrEqual(0.03);
      expect(s.meals.every((m) => Object.values(m.equivalents).every((v) => v > 0 && (v * 2) % 1 === 0))).toBe(true);
    }
  });
});
