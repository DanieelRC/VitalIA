// Lista del súper a partir del menú semanal: suma ingredientes repetidos y los agrupa por familia de alimentos.
import { groupFamily, type GroupFamily } from "./groups";

export type Ingredient = { name: string; quantity?: number | string | null; unit?: string | null };
export type ShoppingItem = { key: string; name: string; quantity: number | null; unit: string; family: GroupFamily | "otros"; recipes: number };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["de", "del", "la", "el", "en", "con", "sin", "al", "a", "y", "o", "para", "fresco", "fresca", "cocido", "cocida", "picado", "picada", "natural", "bajo", "baja"]);
const words = (s: string) => norm(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w));
const singular = (w: string) => w.replace(/(es|s)$/, "");

/** "2", "1/2", "1 1/2", "0,5" → número; "al gusto" → NaN */
export function parseQuantity(q: number | string | null | undefined): number {
  if (q == null || q === "") return NaN;
  if (typeof q === "number") return q;
  const m = /^\s*(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)\s*$/.exec(q);
  if (m) return Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  return Number(q.trim().replace(",", "."));
}

const ABBR = new Set(["g", "kg", "ml", "l", "oz"]);
/** Unidad en singular para sumar "pieza" con "piezas". */
const unitKey = (u: string) => { const n = norm(u); return ABBR.has(n) ? n : n.replace(/(?<=[aeiou])s$/, "").replace(/(?<=[^aeiou])es$/, ""); };
const unitLabel = (key: string, qty: number | null) => (!key || ABBR.has(key) || qty == null || qty <= 1 ? key : /[aeiou]$/.test(key) ? `${key}s` : `${key}es`);

/** Busca a qué familia pertenece un ingrediente comparando su palabra principal con el catálogo de alimentos. */
export function familyOf(ingredient: string, foods: { name: string; group_code: string | null }[]): GroupFamily | "otros" {
  const iw = words(ingredient).map(singular);
  if (!iw.length) return "otros";
  let best: { score: number; code: string | null } = { score: 0, code: null };
  for (const f of foods) {
    const fw = words(f.name).map(singular);
    if (!fw.length) continue;
    // La primera palabra (el alimento en sí) pesa más que los calificativos
    const score = (iw[0] === fw[0] ? 3 : 0) + iw.filter((w) => fw.includes(w)).length;
    if (score > best.score) best = { score, code: f.group_code };
  }
  return best.score >= 3 && best.code ? groupFamily(best.code) : "otros";
}

/**
 * @param recipes ingredientes por receta y cuántas veces aparece la receta en la semana
 */
export function buildShoppingList(
  recipes: { ingredients: Ingredient[]; servings?: number | null; times: number }[],
  foods: { name: string; group_code: string | null }[],
): ShoppingItem[] {
  const map = new Map<string, ShoppingItem>();
  for (const r of recipes) {
    for (const ing of r.ingredients ?? []) {
      if (!ing?.name) continue;
      const unit = unitKey(ing.unit ?? "");
      const key = `${norm(ing.name)}|${unit}`;
      const q = parseQuantity(ing.quantity);
      // Cada aparición en el menú es una porción de la receta
      const amount = Number.isFinite(q) ? (q / Math.max(1, r.servings ?? 1)) * r.times : NaN;
      const item = map.get(key);
      if (item) {
        item.quantity = item.quantity != null && Number.isFinite(amount) ? item.quantity + amount : item.quantity;
        item.recipes += 1;
      } else {
        map.set(key, { key, name: ing.name.trim(), quantity: Number.isFinite(amount) ? amount : null, unit, family: familyOf(ing.name, foods), recipes: 1 });
      }
    }
  }
  return [...map.values()]
    .map((i) => ({ ...i, quantity: i.quantity == null ? null : Math.round(i.quantity * 10) / 10 }))
    .map((i) => ({ ...i, unit: unitLabel(i.unit, i.quantity) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
