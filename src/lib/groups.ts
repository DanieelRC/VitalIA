// Color y familia de cada grupo de equivalentes (SMAE). Un mismo color por familia en toda la app.
export type GroupFamily = "verduras" | "frutas" | "cereales" | "leguminosas" | "aoa" | "leche" | "grasas" | "azucares" | "libres";

export const FAMILY_LABEL: Record<GroupFamily, string> = {
  verduras: "Verduras", frutas: "Frutas", cereales: "Cereales", leguminosas: "Leguminosas", aoa: "Origen animal",
  leche: "Leche", grasas: "Grasas", azucares: "Azúcares", libres: "Libres",
};

export const FAMILY_ORDER: GroupFamily[] = ["verduras", "frutas", "cereales", "leguminosas", "aoa", "leche", "grasas", "azucares", "libres"];

export function groupFamily(code: string | null | undefined): GroupFamily {
  const prefix = (code ?? "").split("_")[0];
  return (FAMILY_ORDER as string[]).includes(prefix) ? (prefix as GroupFamily) : "libres";
}

export const familyColor = (f: GroupFamily) => `var(--g-${f})`;
export const groupColor = (code: string | null | undefined) => familyColor(groupFamily(code));

/** Suma equivalentes por familia para dibujar un plato. */
export function plateSegments(equivalents: Record<string, number>) {
  const sums = new Map<GroupFamily, number>();
  for (const [code, v] of Object.entries(equivalents ?? {})) {
    const f = groupFamily(code);
    if (v > 0 && f !== "libres") sums.set(f, (sums.get(f) ?? 0) + v);
  }
  return FAMILY_ORDER.filter((f) => sums.has(f)).map((f) => ({ family: f, value: sums.get(f)! }));
}
