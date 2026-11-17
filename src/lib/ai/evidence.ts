const LABELS: Record<string, string> = {
  peso_kg: "peso", talla_cm: "talla", edad: "edad", kcal: "energía (kcal)", masa_libre_grasa_kg: "masa libre de grasa", fc_reposo: "frecuencia cardiaca en reposo",
  peso_pregestacional_kg: "peso pregestacional", semana: "semana de gestación", peso_actual_kg: "peso actual", cintura_cm: "cintura", cadera_cm: "cadera",
};
const SEX_WORDS = { hombre: /\b(hombres?|masculin[oa]|var[oó]n|niño|señor|deportista hombre)\b/i, mujer: /\b(mujer(es)?|femenin[oa]|niña|señora|embaraz\w*|gestaci[oó]n|gestante)\b/i };

/**
 * Candado contra datos inventados: una herramienta solo calcula con cifras que aparezcan en la conversación,
 * en el expediente consultado o en el resultado de otra herramienta. Si el modelo "rellena" un dato que nadie dio,
 * la herramienta se niega y le indica que lo pregunte.
 */
export function evidenceGuard(initial: string) {
  let text = initial;
  const numbers = () => {
    const out = new Set<number>();
    for (const src of [text.replace(/(\d),(\d)/g, "$1.$2"), text.replace(/(\d),(\d{3})/g, "$1$2")]) {
      for (const m of src.match(/\d+(?:\.\d+)?/g) ?? []) out.add(Number(m));
    }
    return out;
  };
  return {
    add(s: string) { text += `\n${s}`; },
    /** Cifras de un texto redactado por el modelo que no aparecen en la evidencia: sirve para avisar, no bloquea. */
    unsupported(s: string): number[] {
      const known = [...numbers()];
      const found = (s.replace(/(\d),(\d)/g, "$1.$2").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
      return [...new Set(found)].filter((v) => v > 12 && !known.some((k) => Math.abs(k - v) < 0.011)).slice(0, 8);
    },
    /** Devuelve un error para el modelo si algún dato no tiene respaldo; `undefined` si todo está respaldado. */
    check(fields: Record<string, unknown>, sex?: "hombre" | "mujer"): { error: string } | undefined {
      const known = numbers();
      const has = (v: number) => [...known].some((k) => Math.abs(k - v) < 0.011);
      const missing: string[] = [];
      for (const [k, v] of Object.entries(fields)) {
        if (typeof v !== "number") continue;
        const a = Math.abs(v);
        // La talla puede venir en metros (1.60) y el déficit como número positivo ("déficit de 500")
        if (has(a) || (k === "talla_cm" && has(a / 100))) continue;
        missing.push(`${LABELS[k] ?? k.replace(/_/g, " ")} (${v})`);
      }
      if (sex && !SEX_WORDS[sex].test(text)) missing.push(`sexo (${sex})`);
      if (!missing.length) return undefined;
      return { error: `No se calculó. Estos datos no aparecen en la conversación ni en el expediente: ${missing.join(", ")}. No los supongas ni uses valores típicos: pregunta al nutriólogo por ellos y espera su respuesta.` };
    },
  };
}
