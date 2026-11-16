import { describe, expect, it } from "vitest";
import { cacheKey, isFollowUp, normalizeQuestion } from "./cache";

const base = { day: "2026-11-15", model: "m", system: "sys", question: "¿Qué me toca cenar hoy?" };

describe("caché del asistente", () => {
  it("normaliza mayúsculas, acentos y signos", () => {
    expect(normalizeQuestion("  ¿QUÉ me toca   CENAR hoy?? ")).toBe("que me toca cenar hoy");
  });
  it("misma pregunta escrita distinto → misma llave", () => {
    expect(cacheKey(base)).toBe(cacheKey({ ...base, question: "que me toca cenar hoy" }));
  });
  it("otro día u otro contexto del paciente → llave distinta", () => {
    const k = cacheKey(base);
    expect(cacheKey({ ...base, day: "2026-11-16" })).not.toBe(k);
    expect(cacheKey({ ...base, system: "sys con plan nuevo" })).not.toBe(k);
  });
  it.each(["¿Y en la cena?", "Dame otro ejemplo", "¿eso también aplica para mañana?", "¿Y si no tengo avena?", "explícame lo de antes", "¿por qué?"])(
    "detecta seguimiento: %s",
    (q) => expect(isFollowUp(q)).toBe(true),
  );
  it.each(["¿Qué me toca cenar hoy?", "¿Cuántas tortillas puedo comer en la comida?", "¿Cómo voy con mi peso este mes?"])(
    "pregunta independiente: %s",
    (q) => expect(isFollowUp(q)).toBe(false),
  );
});
