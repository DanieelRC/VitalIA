// Evaluador seguro de expresiones para fórmulas propias del nutriólogo. No usa eval ni Function:
// solo números, variables conocidas, + − × ÷ ^, paréntesis y unas cuantas funciones matemáticas.
export const FORMULA_VARS = {
  peso: "Peso (kg)", talla: "Talla (cm)", edad: "Edad (años)", mlg: "Masa libre de grasa (kg)",
  hombre: "1 si es hombre, 0 si es mujer", mujer: "1 si es mujer, 0 si es hombre",
} as const;
export type FormulaVars = Partial<Record<keyof typeof FORMULA_VARS, number>>;

const FUNCS: Record<string, (...a: number[]) => number> = {
  min: Math.min, max: Math.max, abs: Math.abs, raiz: Math.sqrt, sqrt: Math.sqrt, ln: Math.log, log: Math.log10, redondear: Math.round,
};

type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,(?=\d)/g, ".");
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const v = Number(s.slice(i, j));
      if (!Number.isFinite(v)) throw new Error(`Número no válido: ${s.slice(i, j)}`);
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      out.push({ t: "id", v: s.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/^(),;".includes(c)) { out.push({ t: "op", v: c === ";" ? "," : c }); i++; continue; }
    throw new Error(`Símbolo no permitido: ${c}`);
  }
  return out;
}

/** Evalúa la expresión con las variables dadas. Lanza Error con un mensaje en español si no es válida. */
export function evaluateFormula(src: string, vars: FormulaVars): number {
  if (src.length > 300) throw new Error("La fórmula es demasiado larga.");
  const tokens = tokenize(src);
  if (!tokens.length) throw new Error("Escribe una fórmula.");
  let pos = 0;
  const isOp = (v: string) => tokens[pos]?.t === "op" && tokens[pos].v === v;
  const eat = (v: string) => { if (!isOp(v)) throw new Error(`Se esperaba "${v}".`); pos++; };

  function primary(): number {
    const tk = tokens[pos++];
    if (!tk) throw new Error("La fórmula está incompleta.");
    if (tk.t === "num") return tk.v;
    if (tk.t === "op" && tk.v === "(") { const v = expr(); eat(")"); return v; }
    if (tk.t === "op" && tk.v === "-") return -power();
    if (tk.t === "op" && tk.v === "+") return power();
    if (tk.t === "id") {
      if (isOp("(")) {
        const fn = FUNCS[tk.v];
        if (!fn) throw new Error(`Función desconocida: ${tk.v}`);
        pos++;
        const args: number[] = [];
        if (!isOp(")")) { args.push(expr()); while (isOp(",")) { pos++; args.push(expr()); } }
        eat(")");
        if (!args.length) throw new Error(`${tk.v}() necesita al menos un valor.`);
        return fn(...args);
      }
      if (!(tk.v in FORMULA_VARS)) throw new Error(`Variable desconocida: ${tk.v}`);
      const v = vars[tk.v as keyof typeof FORMULA_VARS];
      if (v == null || !Number.isFinite(v)) throw new Error(`Falta el dato "${tk.v}".`);
      return v;
    }
    throw new Error(`Símbolo inesperado: ${tk.v}`);
  }
  function power(): number {
    const base = primary();
    if (isOp("^")) { pos++; return Math.pow(base, power()); }
    return base;
  }
  function term(): number {
    let v = power();
    while (isOp("*") || isOp("/")) { const op = tokens[pos++].v; const r = power(); v = op === "*" ? v * r : v / r; }
    return v;
  }
  function expr(): number {
    let v = term();
    while (isOp("+") || isOp("-")) { const op = tokens[pos++].v; const r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  const result = expr();
  if (pos < tokens.length) throw new Error(`Sobra texto a partir de "${tokens[pos].v}".`);
  if (!Number.isFinite(result)) throw new Error("El resultado no es un número (¿división entre cero?).");
  return result;
}

/** Valida una fórmula con datos de ejemplo. Devuelve null si es válida o el mensaje de error. */
export function validateFormula(src: string): string | null {
  try {
    evaluateFormula(src, { peso: 70, talla: 165, edad: 30, mlg: 50, hombre: 0, mujer: 1 });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
