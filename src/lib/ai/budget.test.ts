import { describe, expect, it } from "vitest";
import { costUsd, estimateCost, parsePrices } from "./budget";
import { sanitize, screenInput } from "./guard";

describe("presupuesto IA", () => {
  const prices = parsePrices('{"m":{"input":0.2,"output":0.5}}');
  it("costo con precios configurados", () => expect(costUsd(prices, "m", 1_000_000, 1_000_000)).toBeCloseTo(0.7));
  it("modelo sin precio usa tarifa alta (no subestima)", () => expect(costUsd(prices, "x", 1_000_000, 0)).toBe(5));
  it("JSON inválido no rompe", () => expect(parsePrices("{oops")).toEqual({}));
  it("estimación incluye salida máxima", () => expect(estimateCost(prices, "m", 3000, 600)).toBeCloseTo((1000 * 0.2 + 600 * 0.5) / 1e6));
});

describe("filtros de entrada", () => {
  it("detecta emergencia", () => expect(screenInput("tengo dolor en el pecho y no puedo respirar").block).toBe(true));
  it("detecta conducta de TCA", () => expect(screenInput("quiero vomitar después de comer").block).toBe(true));
  it("deja pasar dudas normales", () => expect(screenInput("¿con qué cambio la tortilla?").block).toBe(false));
  it("limpia caracteres de control", () => expect(sanitize("hola\u0000   mundo ")).toBe("hola  mundo"));
});
