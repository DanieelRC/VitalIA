import { describe, expect, it } from "vitest";
import { screenInput } from "./guard";

const reason = (t: string) => {
  const r = screenInput(t);
  return r.block ? r.reason : null;
};

describe("screenInput", () => {
  it.each([
    "quiero vomitar todo lo que como para bajar de peso",
    "me provoco el vómito después de cenar",
    "tomo laxantes para no engordar",
    "voy a dejar de comer una semana",
    "no he comido en 3 días",
    "anoche me di un atracón y me siento fatal",
  ])("detecta conducta de TCA: %s", (t) => expect(reason(t)).toBe("eating_disorder"));

  it.each(["tengo dolor fuerte en el pecho", "no quiero vivir", "creo que me desmayo"])(
    "detecta emergencia: %s",
    (t) => expect(reason(t)).toBe("emergency"),
  );

  it.each(["¿Puedo cambiar el arroz por papa?", "¿Cuántas tortillas puedo comer en la cena?", "el embarazo me da náuseas y vómito por la mañana"])(
    "no bloquea preguntas normales: %s",
    (t) => expect(reason(t)).toBeNull(),
  );
});
