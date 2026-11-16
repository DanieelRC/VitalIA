// Filtros previos a la llamada al modelo: emergencias y abuso evidente. No sustituyen al system prompt.

const EMERGENCY = [
  /suicid/i, /quitarme la vida/i, /matarme/i, /no quiero vivir/i, /hacerme da[ñn]o/i, /autolesi/i,
  /dolor (fuerte )?(en el )?pecho/i, /no puedo respirar/i, /me desmay/i, /convulsi/i, /v[oó]mito con sangre/i,
  /hipoglucemia severa/i, /anafilaxia/i, /se me cierra la garganta/i,
];

const PURGE = [
  /v[oó]mit(ar|o|ando|arlo|arla|arme)\b.*\b(bajar|adelgazar|peso|comida|comer|como|com[ií]|cenar|desayunar|engordar|calor[ií]as)/i,
  /(provoc|induc)\w* (el |los )?v[oó]mito/i,
  /(laxantes|diur[eé]ticos|purgantes)\b.*\b(bajar|adelgazar|peso|engordar)/i,
  /dejar de comer/i,
  /no (he )?com(ido|er)\w* (en|por) (\d+|varios|muchos|dos|tres) d[ií]as/i,
  /atrac[oó]n|atracones/i,
];

export const EMERGENCY_REPLY =
  "Lo que describes puede ser una urgencia. Llama al 911 o acude al servicio de urgencias más cercano ahora. " +
  "Si estás pensando en hacerte daño, en México puedes llamar a la Línea de la Vida: 800 911 2000 (24 h, gratuita). " +
  "Avísale también a tu nutriólogo por Mensajes.";

export const ED_REPLY =
  "Gracias por contarlo. Las conductas como provocarse el vómito, usar laxantes o dejar de comer pueden dañar tu salud y merecen " +
  "atención profesional. Por favor platícalo con tu nutriólogo por Mensajes; si te sientes en riesgo, llama a la Línea de la Vida 800 911 2000.";

export function screenInput(text: string): { block: false } | { block: true; reason: string; reply: string } {
  if (EMERGENCY.some((r) => r.test(text))) return { block: true, reason: "emergency", reply: EMERGENCY_REPLY };
  if (PURGE.some((r) => r.test(text))) return { block: true, reason: "eating_disorder", reply: ED_REPLY };
  return { block: false };
}

/** Normaliza la entrada: quita caracteres de control y espacios excesivos. */
export function sanitize(text: string) {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s{3,}/g, "  ").trim();
}
