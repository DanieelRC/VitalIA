import { createHash, timingSafeEqual } from "node:crypto";

/** Escapa texto para insertarlo en HTML (correos). */
export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Autoriza un cron por su secreto, comparando en tiempo constante para no filtrarlo por tiempos de respuesta. */
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  return timingSafeEqual(Buffer.from(sha256(req.headers.get("authorization") ?? "")), Buffer.from(sha256(`Bearer ${secret}`)));
}

/** Tipos de archivo aceptados, con la extensión que se guarda y su firma binaria. */
const SIGNATURES: Record<string, { ext: string; test: (b: Uint8Array) => boolean }> = {
  "application/pdf": { ext: "pdf", test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  "image/jpeg": { ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/webp": { ext: "webp", test: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
  "image/heic": { ext: "heic", test: (b) => ascii(b, 4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(ascii(b, 8, 12)) },
};
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

/**
 * Valida que el contenido real del archivo coincida con el tipo declarado (el tipo lo envía el
 * navegador y se puede falsificar). Devuelve la extensión segura o null.
 */
export async function verifiedFileType(file: File, allowed: string[]): Promise<{ mime: string; ext: string } | null> {
  const sig = SIGNATURES[file.type];
  if (!sig || !allowed.includes(file.type)) return null;
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return sig.test(head) ? { mime: file.type, ext: sig.ext } : null;
}

/**
 * Destino de redirección seguro: solo dentro de este sitio. Se compara el origen ya resuelto, porque comprobar
 * el texto no basta: "/\evil.com" o "/<tab>/evil.com" empiezan con "/" pero el navegador los resuelve a otro dominio.
 */
export function safeNext(nextParam: string | null, origin: string) {
  try {
    const target = new URL(nextParam ?? "/", origin);
    return target.origin === origin ? target : new URL("/", origin);
  } catch {
    return new URL("/", origin);
  }
}

/** El origen de la petición debe ser el propio sitio (defensa extra contra CSRF en rutas API). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // peticiones del mismo origen sin cabecera (navegación, herramientas)
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}
