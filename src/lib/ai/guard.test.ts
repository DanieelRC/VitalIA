import { describe, expect, it } from "vitest";
import { normalize, screenInput } from "./guard";

const reason = (t: string) => {
  const r = screenInput(t);
  return r.block ? r.reason : null;
};

describe("normalize", () => {
  it("quita acentos, signos y letras estiradas", () => {
    expect(normalize("¡¡Me QUIEROOO morír!!")).toBe("me quiero morir");
    expect(normalize("hacerme daño")).toBe("hacerme dano");
    expect(normalize("q ya no quiero vivir")).toBe("que ya no quiero vivir");
  });
});

describe("screenInput", () => {
  it.each([
    "quiero vomitar todo lo que como para bajar de peso",
    "me provoco el vómito después de cenar",
    "tomo laxantes para no engordar",
    "voy a dejar de comer una semana",
    "no he comido en 3 días",
    "anoche me di un atracón y me siento fatal",
    "después de comer me meto los dedos",
    "a veces me purgo",
  ])("detecta conducta de TCA: %s", (t) => expect(reason(t)).toBe("eating_disorder"));

  // Ideas suicidas o de autolesión: frases directas, coloquiales, sin acentos y con letras repetidas
  it.each([
    "quiero suicidarme",
    "no quiero vivir",
    "me quiero morir",
    "Me quiero moriiir",
    "ya no quiero estar aquí",
    "ya no quiero seguir",
    "quisiera morir",
    "tengo ganas de morirme",
    "quiero morirme",
    "estarían mejor sin mí",
    "sería mejor estar muerta",
    "no le veo sentido a la vida",
    "ya no vale la pena vivir",
    "quiero acabar con todo",
    "voy a terminar con mi vida",
    "quiero desaparecer",
    "me corto los brazos cuando me siento mal",
    "a veces quiero hacerme daño",
    "me voy a tomar todas las pastillas",
    "pienso en quitarme la vida",
    "me voy a matar",
    "q ya no kiero vivir",
  ])("detecta riesgo de autolesión: %s", (t) => expect(reason(t)).toBe("emergency"));

  it.each([
    "tengo dolor fuerte en el pecho",
    "creo que me desmayo",
    "no puedo respirar bien",
    "estoy vomitando sangre",
    "se me está cerrando la garganta después de comer camarón",
  ])("detecta urgencia médica: %s", (t) => expect(reason(t)).toBe("emergency"));

  it.each([
    "¿Puedo cambiar el arroz por papa?",
    "¿Cuántas tortillas puedo comer en la cena?",
    "el embarazo me da náuseas y vómito por la mañana",
    "me muero de hambre en las tardes, ¿qué colación puedo comer?",
    "muero por unos tacos, ¿cuántos puedo?",
    "no me quiero morir joven, por eso quiero cuidarme",
    "no quiero hacerme daño con tanta azúcar",
    "este pastel está para morirse",
    "quiero vivir más sano",
    "¿el café me hace daño?",
  ])("no bloquea preguntas normales: %s", (t) => expect(reason(t)).toBeNull());

  it("la respuesta de crisis siempre da el número oficial", () => {
    const r = screenInput("me quiero morir");
    expect(r.block && r.reply).toContain("800 911 2000");
  });
});
