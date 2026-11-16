import { createHash } from "node:crypto";

/** Normaliza una pregunta para comparar: minúsculas, sin acentos, signos ni espacios extra. */
export function normalizeQuestion(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Palabras que indican que la pregunta depende de lo que se habló antes
const FOLLOW_UP = /^(y|e|o|pero|entonces|ok|vale|si|no)\b|\b(eso|esa|ese|esos|esas|esto|aquello|mismo|misma|mismos|mismas|anterior|antes|tambien|otro|otra|otros|otras|mas|dijiste|mencionaste|lo de|la de|el de)\b/;

/**
 * Una pregunta de seguimiento ("¿y en la cena?", "dame otro ejemplo") depende de la conversación,
 * así que no se responde desde caché ni se guarda en ella.
 */
export function isFollowUp(text: string) {
  const n = normalizeQuestion(text);
  return n.split(" ").length <= 3 || FOLLOW_UP.test(n);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Llave de caché: día, modelo, prompt de sistema con el contexto del paciente (si cambian sus
 * datos, cambia la llave) y la pregunta normalizada.
 */
export function cacheKey(p: { day: string; model: string; system: string; question: string }) {
  return sha([p.day, p.model, sha(p.system), normalizeQuestion(p.question)].join("\u0001"));
}
