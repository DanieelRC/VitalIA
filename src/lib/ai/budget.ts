// Cálculo de costos y mensajes de límite. Funciones puras (testeables).
export type Prices = Record<string, { input: number; output: number }>; // USD por millón de tokens

export function parsePrices(raw: string | undefined): Prices {
  try {
    const p = JSON.parse(raw ?? "{}");
    return typeof p === "object" && p ? p : {};
  } catch {
    return {};
  }
}

/** Si el modelo no tiene precio configurado se usa uno alto para no subestimar el gasto. */
const FALLBACK = { input: 5, output: 25 };

export function costUsd(prices: Prices, model: string, inputTokens: number, outputTokens: number) {
  const p = prices[model] ?? FALLBACK;
  return (inputTokens * p.input + outputTokens * p.output) / 1e6;
}

/** Estimación conservadora previa a la llamada: ~3 caracteres por token + salida máxima. */
export function estimateCost(prices: Prices, model: string, promptChars: number, maxOutputTokens: number) {
  return costUsd(prices, model, Math.ceil(promptChars / 3), maxOutputTokens);
}

export const LIMIT_MESSAGES: Record<string, string> = {
  disabled: "El asistente está desactivado temporalmente por el consultorio.",
  rate: "Estás enviando mensajes muy rápido. Espera un minuto e inténtalo de nuevo.",
  daily: "Alcanzaste el límite diario de mensajes del asistente. Vuelve mañana o escribe a tu nutriólogo.",
  tokens: "Alcanzaste el límite mensual de uso del asistente. Escribe a tu nutriólogo por Mensajes.",
  budget: "El asistente alcanzó el presupuesto mensual del consultorio. Escribe a tu nutriólogo por Mensajes.",
  too_long: "Tu mensaje es demasiado largo. Resúmelo, por favor.",
  empty: "Escribe una pregunta.",
};
