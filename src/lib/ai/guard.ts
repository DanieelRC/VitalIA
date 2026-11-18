// Filtros previos a la llamada al modelo: emergencias y abuso evidente. No sustituyen al system prompt.
// Se aplican sobre el texto normalizado (minúsculas, sin acentos, sin letras repetidas), así que los patrones
// se escriben sin acentos. Ante la duda se bloquea: la respuesta fija es amable y avisa al consultorio.

/** Minúsculas, sin acentos ni signos, letras estiradas reducidas («muerooo» → «muero») y abreviaturas comunes. */
export function normalize(text: string) {
  return ` ${text}`
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/([a-z])\1{2,}/g, "$1")
    .replace(/\s(q|k|ke)\s/g, " que ")
    .replace(/\bkier/g, "quier")
    .replace(/\s(xq|pq|porq)\s/g, " porque ")
    .replace(/\s+/g, " ")
    .trim();
}

// «no» justo antes del verbo («no me quiero morir», «no quiero hacerme daño») invierte el sentido
const NOT_NEGATED = String.raw`(?<!\b(no|nunca) (me )?((quiero|quisiera|voy a) )?)`;

const SELF_HARM = [
  /suicid/,
  /quitar(me|se)? la vida/,
  /\b(me (voy|quiero) a matar|matarme)\b/,
  new RegExp(`${NOT_NEGATED}\\b(me )?(quiero|quisiera|deseo|prefiero|necesito) morir`),
  /\bganas de morir/,
  /\bmorirme\b/,
  /\bmejor (estar )?(muert[oa]|no existir|no estar)\b/,
  /\bestar(ia|ian)? mejor sin mi\b/,
  /\bno quiero (seguir )?(vivir|existir|despertar)\b/,
  /\bya no quiero (seguir|estar|existir|despertar|vivir)\b/,
  /\bno quiero estar aqui\b/,
  /\bno (le )?veo (sentido|caso) (a|de) (la vida|vivir|seguir)\b/,
  /\b(no vale|ya no vale) la pena (vivir|seguir)\b/,
  /\b(acabar|terminar) con (todo|mi vida)\b/,
  /\bquiero desaparecer\b/,
  new RegExp(`${NOT_NEGATED}\\b(hacerme|me hago|me hice) (dano|danio)\\b`),
  /\bautolesi/,
  /\b(cortarme|me corto|me corte) (las venas|los brazos|las munecas|las piernas)\b/,
  /\b(lastimarme|me lastimo)\b/,
  /\b(tomarme|me tome|me voy a tomar) (todas )?las pastillas\b/,
  /\bsobredosis\b/,
];

const MEDICAL = [
  /dolor (muy )?(fuerte )?(en el |del )?pecho/,
  /\bno puedo respirar\b/, /\bme falta (mucho )?el aire\b/,
  /\bme desmay/, /\bdesmayo\b/, /\bconvulsi/,
  /\bvomit(o|ando|e) (con )?sangre\b/, /\bsangre en (el vomito|las heces|la popo)\b/,
  /\bhipoglucemia (severa|grave)\b/, /\banafilaxia\b/, /\bse me (esta )?cerrando la garganta\b/, /\bse me cierra la garganta\b/,
];

const PURGE = [
  /\bvomit(ar|o|ando|arlo|arla|arme)\b.*\b(bajar|adelgazar|peso|comida|comer|como|comi|cenar|desayunar|engordar|calorias)/,
  /\b(provoc|induc)\w* (el |los )?vomito/,
  /\bmeterme los dedos\b|\bme meto los dedos\b/,
  /\bpurg(ar|arme|o|ue)\b/,
  /\b(laxantes|diureticos|purgantes)\b.*\b(bajar|adelgazar|peso|engordar)/,
  /\bdejar de comer\b/,
  /\bno (he )?com(ido|er)\w* (en|por) (\d+|varios|muchos|dos|tres|cuatro|cinco) dias\b/,
  /\batracon|atracones\b/,
];

export const CRISIS_LINE = "Línea de la Vida: 800 911 2000 (24 h, gratuita)";

export const EMERGENCY_REPLY =
  "Lo que describes puede ser una urgencia. Llama al 911 o acude al servicio de urgencias más cercano ahora. " +
  `Si estás pensando en hacerte daño, en México puedes llamar a la ${CRISIS_LINE}. ` +
  "Ya avisamos a tu nutriólogo; si puedes, escríbele también por Mensajes.";

export const ED_REPLY =
  "Gracias por contarlo. Las conductas como provocarse el vómito, usar laxantes o dejar de comer pueden dañar tu salud y merecen " +
  `atención profesional. Por favor platícalo con tu nutriólogo por Mensajes; si te sientes en riesgo, llama a la ${CRISIS_LINE}.`;

export function screenInput(text: string): { block: false } | { block: true; reason: string; reply: string } {
  const t = normalize(text);
  if (SELF_HARM.some((r) => r.test(t)) || MEDICAL.some((r) => r.test(t))) return { block: true, reason: "emergency", reply: EMERGENCY_REPLY };
  if (PURGE.some((r) => r.test(t))) return { block: true, reason: "eating_disorder", reply: ED_REPLY };
  return { block: false };
}

/** Normaliza la entrada: quita caracteres de control y espacios excesivos. */
export function sanitize(text: string) {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s{3,}/g, "  ").trim();
}
