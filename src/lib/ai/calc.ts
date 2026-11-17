// Cálculos que el asistente ejecuta como herramientas. Son las mismas fórmulas de la app (lib/nutrition):
// el modelo no hace aritmética, solo decide qué calcular y explica el resultado.
import {
  activityFactors, adequacy, athleteTargets, basalEnergy, BMI_SCALE, DEFAULT_RANGES, energyFormulas, evaluateFormula, evaluateMeasurement,
  evaluationLabels, heartRateZones, macroBalance, maxHeartRate, metKcal, pregnancyPlan, somatotype, splitEquivalentsByMeals,
  suggestDailyEquivalents, totalEnergy, totalsFromEquivalents, waterNeeds, zoneOf, bmi, adjustedWeight, idealWeight, oneRepMaxBrzycki, oneRepMaxEpley,
  type AthleteGoal, type EnergyFormula, type Group, type MacroState, type Sex, type SomatotypeInput, type TrainingLoad,
} from "@/lib/nutrition";
import { LAB_BY_KEY, LABS, labFlag } from "@/lib/nutrition/labs";

export type CalcRow = { etiqueta: string; valor: string; nota?: string; estado?: "normal" | "bajo" | "alto" | "limite" };
/** Resultado estructurado: la interfaz lo muestra como tarjeta y el modelo lo cita tal cual. */
export type PlanDraft = {
  name: string; kcal_target: number;
  macros: { mode: "porcentaje"; protein_g: number; fat_g: number; carbs_g: number; protein_pct: number; fat_pct: number; carbs_pct: number };
  meals: { name: string; kcal_pct: number; equivalents: Record<string, number> }[]; recommendations: string | null;
};
export type NoteDraft = {
  reason?: string; subjective: string; objective: string; assessment: string; plan: string;
  pes: { domain: "ingestion" | "clinico" | "conductual"; problem: string; etiology: string; signs: string }[];
};
/** Borrador del Copiloto de consulta: no se guarda hasta que el nutriólogo pulsa el botón de la tarjeta. */
export type CardAction = { tipo: "plan"; plan: PlanDraft } | { tipo: "nota"; nota: NoteDraft } | { tipo: "mensaje"; mensaje: string };
export type CalcResult = { titulo: string; datos: string[]; formula?: string[]; resultados: CalcRow[]; avisos?: string[]; texto?: { titulo: string; cuerpo: string }[]; accion?: CardAction };

const SEX = (s: "hombre" | "mujer"): Sex => (s === "hombre" ? "M" : "F");
const sexLabel = (s: Sex) => (s === "M" ? "hombre" : "mujer");

const FORMULA_TEXT: Record<EnergyFormula, string> = {
  harris_benedict: "H: 66.473 + 13.7516·P + 5.0033·T − 6.755·E · M: 655.0955 + 9.5634·P + 1.8496·T − 4.6756·E",
  mifflin: "10·P + 6.25·T − 5·E + 5 (hombre) o − 161 (mujer)",
  fao_oms: "a·P + b según sexo y grupo de edad (FAO/OMS 1985)",
  schofield: "a·P + b según sexo y grupo de edad (Schofield)",
  valencia: "a·P + b según sexo y grupo de edad (Valencia, población mexicana)",
  owen: "H: 879 + 10.2·P · M: 795 + 7.18·P",
  katch_mcardle: "370 + 21.6·MLG",
  cunningham: "500 + 22·MLG",
};

export function calcEnergy(p: {
  sexo: "hombre" | "mujer"; peso_kg: number; talla_cm: number; edad: number; masa_libre_grasa_kg?: number;
  formulas?: EnergyFormula[]; factor_actividad?: number; factor_estres?: number; eta_pct?: number; ajuste_kcal?: number;
  propias?: { name: string; expression: string }[];
}): CalcResult {
  const sex = SEX(p.sexo);
  const input = { weightKg: p.peso_kg, heightCm: p.talla_cm, age: p.edad, sex, leanKg: p.masa_libre_grasa_kg };
  const keys = (p.formulas?.length ? p.formulas : (Object.keys(energyFormulas) as EnergyFormula[]));
  const fa = p.factor_actividad ?? 1.2, fe = p.factor_estres ?? 1, eta = p.eta_pct ?? 10, adj = p.ajuste_kcal ?? 0;
  const resultados: CalcRow[] = [];
  const avisos: string[] = [];
  const formula: string[] = [];
  for (const k of keys) {
    const geb = basalEnergy(k, input);
    if (!Number.isFinite(geb)) { avisos.push(`${energyFormulas[k].label}: requiere la masa libre de grasa.`); continue; }
    const get = totalEnergy({ geb, activity: fa, stress: fe, etaPct: eta, adjustment: adj });
    resultados.push(adj
      ? { etiqueta: energyFormulas[k].label, valor: `GEB ${geb} kcal · GET ${totalEnergy({ geb, activity: fa, stress: fe, etaPct: eta, adjustment: 0 })} kcal · energía objetivo ${get} kcal`, nota: `La energía objetivo ya incluye el ajuste de ${adj > 0 ? "+" : "−"}${Math.abs(adj)} kcal: no lo apliques otra vez.` }
      : { etiqueta: energyFormulas[k].label, valor: `GEB ${geb} kcal · GET ${get} kcal` });
    if (p.formulas?.length) formula.push(`${energyFormulas[k].label}: ${FORMULA_TEXT[k]}`);
  }
  for (const f of p.propias ?? []) {
    try {
      const geb = Math.round(evaluateFormula(f.expression, { peso: p.peso_kg, talla: p.talla_cm, edad: p.edad, mlg: p.masa_libre_grasa_kg, hombre: sex === "M" ? 1 : 0, mujer: sex === "F" ? 1 : 0 }));
      resultados.push({ etiqueta: `${f.name} (fórmula propia)`, valor: `GEB ${geb} kcal · GET ${totalEnergy({ geb, activity: fa, stress: fe, etaPct: eta, adjustment: adj })} kcal`, nota: f.expression });
    } catch (e) { avisos.push(`${f.name}: ${(e as Error).message}`); }
  }
  formula.push(`GET = GEB × FA (${fa}) × FE (${fe}) + ETA (${eta} % del GEB)`);
  if (adj) formula.push(`Energía objetivo = GET ${adj > 0 ? "+" : "−"} ${Math.abs(adj)} kcal`);
  if (p.factor_actividad == null) avisos.push(`No se indicó actividad física: se usó sedentario (1.2). Opciones: ${activityFactors.map((a) => a.label).join(", ")}.`);
  return {
    titulo: "Gasto energético",
    datos: [sexLabel(sex), `${p.peso_kg} kg`, `${p.talla_cm} cm`, `${p.edad} años`, ...(p.masa_libre_grasa_kg ? [`MLG ${p.masa_libre_grasa_kg} kg`] : [])],
    formula, resultados, avisos,
  };
}

export function calcBody(p: {
  sexo: "hombre" | "mujer"; edad: number; peso_kg: number; talla_cm: number;
  cintura_cm?: number; cadera_cm?: number; muneca_cm?: number; brazo_cm?: number; pantorrilla_cm?: number;
  pliegues_mm?: Partial<Record<"triceps" | "biceps" | "subescapular" | "suprailiaco" | "abdominal" | "muslo" | "pecho" | "axilar" | "pantorrilla", number>>;
}): CalcResult {
  const sex = SEX(p.sexo);
  const ev = evaluateMeasurement({
    weight_kg: p.peso_kg, height_cm: p.talla_cm,
    circumferences: { cintura: p.cintura_cm, cadera: p.cadera_cm, muneca: p.muneca_cm, brazo: p.brazo_cm, pantorrilla: p.pantorrilla_cm },
    skinfolds: p.pliegues_mm,
  }, sex, p.edad);
  const imc = bmi(p.peso_kg, p.talla_cm);
  const tone = zoneOf(BMI_SCALE, imc).tone;
  const resultados: CalcRow[] = Object.entries(ev).map(([k, v]) => ({
    etiqueta: evaluationLabels[k] ?? k, valor: String(v.value), nota: [v.label, v.method].filter(Boolean).join(" · ") || undefined,
    estado: k === "imc" ? tone : undefined,
  }));
  const avisos = [];
  if (!p.pliegues_mm || Object.keys(p.pliegues_mm).length < 3) avisos.push("Sin pliegues suficientes no se calcula el % de grasa (Durnin-Womersley requiere bíceps, tríceps, subescapular y suprailiaco; Jackson-Pollock 3, tres pliegues según sexo).");
  if (!p.cintura_cm) avisos.push("Sin cintura no se calculan los índices cintura-cadera y cintura-estatura.");
  return { titulo: "Composición corporal", datos: [sexLabel(sex), `${p.edad} años`, `${p.peso_kg} kg`, `${p.talla_cm} cm`], resultados, avisos };
}

type MacroUnit = "porcentaje" | "g_por_kg";
export function calcMacros(p: { kcal: number; peso_kg?: number; proteina: number; lipidos: number; hidratos?: number; unidad: MacroUnit; unidad_lipidos?: MacroUnit; unidad_hidratos?: MacroUnit }): CalcResult {
  const avisos: string[] = [];
  const fail = (msg: string): CalcResult => ({ titulo: "Distribución de macronutrientes", datos: [], resultados: [], avisos: [msg] });
  const u = { protein: p.unidad, fat: p.unidad_lipidos ?? p.unidad, carbs: p.unidad_hidratos ?? p.unidad };
  if (Object.values(u).includes("g_por_kg") && !p.peso_kg) return fail("Para distribuir en g/kg se necesita el peso.");
  for (const [name, v, unit] of [["proteína", p.proteina, u.protein], ["lípidos", p.lipidos, u.fat], ["hidratos", p.hidratos ?? 0, u.carbs]] as const) {
    if (unit === "g_por_kg" && v > 12) return fail(`${v} g/kg de ${name} no es plausible: si es un porcentaje, indica su unidad como "porcentaje" (se pueden mezclar unidades por macronutriente).`);
  }
  const toPct = (v: number, unit: MacroUnit, f: number) => (unit === "g_por_kg" ? (v * (p.peso_kg ?? 0) * f * 100) / p.kcal : v);
  const pp = toPct(p.proteina, u.protein, 4), fp = toPct(p.lipidos, u.fat, 9);
  const cp = p.hidratos != null ? toPct(p.hidratos, u.carbs, 4) : Math.max(0, 100 - pp - fp);
  if (p.hidratos == null) avisos.push("Los hidratos completan la energía restante.");
  const pct: MacroState["pct"] = { protein: pp, fat: fp, carbs: cp };
  const b = macroBalance({ pct, locks: { protein: null, fat: null, carbs: null } }, p.kcal, p.peso_kg ?? 0);
  const names = { protein: "Proteína", fat: "Lípidos", carbs: "Hidratos de carbono" } as const;
  const resultados: CalcRow[] = b.rows.map((r) => ({
    etiqueta: names[r.key], valor: `${r.g} g · ${r.pct} %${p.peso_kg ? ` · ${r.gkg} g/kg` : ""} · ${r.kcal} kcal`,
    nota: `Rango aceptable ${DEFAULT_RANGES.pct[r.key].low}–${DEFAULT_RANGES.pct[r.key].high} %`, estado: r.pctStatus,
  }));
  if (!b.balanced) avisos.push(`Los porcentajes suman ${b.sum} %: ${b.unassignedKcal > 0 ? "faltan" : "sobran"} ${Math.abs(b.unassignedKcal)} kcal por asignar.`);
  return {
    titulo: "Distribución de macronutrientes",
    datos: [`${p.kcal} kcal`, ...(p.peso_kg ? [`${p.peso_kg} kg`] : [])],
    formula: ["gramos = kcal × % ÷ 100 ÷ (4 proteína · 9 lípidos · 4 hidratos)"],
    resultados: [...resultados, { etiqueta: "Valoración", valor: b.verdict === "equilibrada" ? "Equilibrada (dentro de los rangos AMDR)" : b.verdict === "descuadrada" ? "No suma 100 %" : "Fuera de los rangos AMDR en al menos un macronutriente" }],
    avisos,
  };
}

export function calcEquivalents(p: { kcal: number; proteina_g: number; lipidos_g: number; hidratos_g: number; tiempos?: { nombre: string; porcentaje: number }[] }, groups: Group[]): CalcResult {
  const target = { protein_g: p.proteina_g, fat_g: p.lipidos_g, carbs_g: p.hidratos_g };
  const daily = suggestDailyEquivalents(p.kcal, target, groups);
  const t = totalsFromEquivalents(daily, groups);
  const name = (code: string) => { const g = groups.find((x) => x.code === code); return g ? (g.subgroup ? `${g.name} (${g.subgroup})` : g.name) : code; };
  const resultados: CalcRow[] = Object.entries(daily).map(([code, v]) => ({ etiqueta: name(code), valor: `${v} equivalentes` }));
  const adq = (label: string, got: number, goal: number): CalcRow => { const a = adequacy(got, goal); return { etiqueta: `Adecuación · ${label}`, valor: `${Math.round(got)} de ${Math.round(goal)} (${a.pct} %)`, estado: a.ok ? "normal" : a.pct < 95 ? "bajo" : "alto" }; };
  resultados.push(adq("energía (kcal)", t.kcal, p.kcal), adq("proteína (g)", t.protein_g, p.proteina_g), adq("lípidos (g)", t.fat_g, p.lipidos_g), adq("hidratos (g)", t.carbs_g, p.hidratos_g));
  if (p.tiempos?.length) {
    const split = splitEquivalentsByMeals(daily, p.tiempos.map((m) => ({ kcal_pct: m.porcentaje })));
    p.tiempos.forEach((m, i) => resultados.push({
      etiqueta: `${m.nombre} (${m.porcentaje} %)`,
      valor: Object.entries(split[i]).filter(([, v]) => v > 0).map(([c, v]) => `${v} ${name(c)}`).join(", ") || "—",
      nota: `${totalsFromEquivalents(split[i], groups).kcal} kcal`,
    }));
  }
  return {
    titulo: "Equivalentes (SMAE)", datos: [`${p.kcal} kcal`, `P ${p.proteina_g} g`, `L ${p.lipidos_g} g`, `HC ${p.hidratos_g} g`],
    formula: ["Propuesta inicial con el aporte promedio de cada grupo; adecuación aceptable 95–105 %."], resultados,
    avisos: ["Es un punto de partida: ajusta los equivalentes en el estudio de distribución del plan."],
  };
}

export function calcLabs(valores: Record<string, number>): CalcResult {
  const resultados: CalcRow[] = [];
  const avisos: string[] = [];
  for (const [k, v] of Object.entries(valores)) {
    const d = LAB_BY_KEY[k];
    if (!d) { avisos.push(`"${k}" no está en el catálogo (${LABS.map((l) => l.key).join(", ")}).`); continue; }
    const flag = labFlag(k, v)!;
    resultados.push({ etiqueta: d.label, valor: `${v} ${d.unit}`, estado: flag, nota: [d.low != null && d.high != null ? `Referencia ${d.low}–${d.high}` : d.high != null ? `Referencia ≤ ${d.high}` : `Referencia ≥ ${d.low}`, d.note].filter(Boolean).join(" · ") });
  }
  return { titulo: "Laboratorios", datos: [], resultados, avisos: [...avisos, "Rangos orientativos para adultos; prevalecen los del laboratorio y el criterio clínico."] };
}

export function calcExercise(p: { edad: number; fc_reposo?: number; peso_kg?: number; met?: number; minutos?: number }): CalcResult {
  const fcmax = maxHeartRate.tanaka(p.edad);
  const resultados: CalcRow[] = [
    { etiqueta: "FC máxima (Tanaka)", valor: `${fcmax} lpm`, nota: "208 − 0.7 × edad" },
    { etiqueta: "FC máxima (220 − edad)", valor: `${maxHeartRate.fox(p.edad)} lpm` },
  ];
  if (p.fc_reposo) for (const z of heartRateZones(fcmax, p.fc_reposo)) resultados.push({ etiqueta: `Zona ${z.zone} · ${z.label} (${z.from}–${z.to} %)`, valor: `${z.minHr}–${z.maxHr} lpm`, nota: "Karvonen: FCreposo + %·(FCmáx − FCreposo)" });
  if (p.met && p.peso_kg && p.minutos) resultados.push({ etiqueta: "Gasto de la sesión", valor: `${metKcal(p.met, p.peso_kg, p.minutos)} kcal`, nota: `MET ${p.met} × 3.5 × ${p.peso_kg} kg ÷ 200 × ${p.minutos} min` });
  return { titulo: "Ejercicio", datos: [`${p.edad} años`, ...(p.fc_reposo ? [`FC reposo ${p.fc_reposo} lpm`] : [])], resultados, avisos: p.fc_reposo ? [] : ["Con la frecuencia cardiaca en reposo se calculan las zonas de entrenamiento (Karvonen)."] };
}

export function calcSomatotype(i: SomatotypeInput): CalcResult {
  const s = somatotype(i);
  return {
    titulo: "Somatotipo (Heath-Carter)", datos: [`${i.weightKg} kg`, `${i.heightCm} cm`],
    formula: ["Endomorfia: −0.7182 + 0.1451X − 0.00068X² + 0.0000014X³, X = Σ3 pliegues × 170.18 ÷ talla", "Mesomorfia: 0.858·húmero + 0.601·fémur + 0.188·brazo corregido + 0.161·pantorrilla corregida − 0.131·talla + 4.5", "Ectomorfia: según índice ponderal (talla ÷ ∛peso)"],
    resultados: [
      { etiqueta: "Endomorfia – Mesomorfia – Ectomorfia", valor: `${s.endo} – ${s.meso} – ${s.ecto}` },
      { etiqueta: "Clasificación", valor: s.label }, { etiqueta: "Índice ponderal", valor: String(s.hwr) }, { etiqueta: "Somatocarta (X, Y)", valor: `${s.x}, ${s.y}` },
    ],
  };
}

export function calcPregnancy(p: { peso_pregestacional_kg: number; talla_cm: number; semana: number; peso_actual_kg?: number }): CalcResult {
  const pre = bmi(p.peso_pregestacional_kg, p.talla_cm);
  const g = pregnancyPlan(pre, p.peso_pregestacional_kg, p.semana);
  const resultados: CalcRow[] = [
    { etiqueta: "IMC pregestacional", valor: `${pre} kg/m²`, nota: g.category },
    { etiqueta: "Ganancia total recomendada", valor: `${g.totalGain[0]}–${g.totalGain[1]} kg`, nota: "IOM 2009" },
    { etiqueta: "Ganancia semanal (2.º y 3.er trimestre)", valor: `${g.weeklyGain[0]}–${g.weeklyGain[1]} kg/semana` },
    { etiqueta: `Peso esperado en la semana ${p.semana}`, valor: `${g.expectedWeightNow[0]}–${g.expectedWeightNow[1]} kg` },
    { etiqueta: `Energía adicional (trimestre ${g.trimester})`, valor: `+${g.extraKcal} kcal/día` },
  ];
  if (p.peso_actual_kg) {
    const gain = Math.round((p.peso_actual_kg - p.peso_pregestacional_kg) * 10) / 10;
    resultados.push({ etiqueta: "Ganancia actual", valor: `${gain} kg`, estado: gain < g.expectedGainNow[0] ? "bajo" : gain > g.expectedGainNow[1] ? "alto" : "normal", nota: `Esperado ${g.expectedGainNow[0]}–${g.expectedGainNow[1]} kg` });
  }
  return { titulo: "Embarazo", datos: [`${p.peso_pregestacional_kg} kg antes del embarazo`, `${p.talla_cm} cm`, `semana ${p.semana}`], resultados, avisos: ["Embarazo único. En embarazo múltiple o adolescente los rangos cambian."] };
}

export function calcAthlete(p: { peso_kg: number; carga: TrainingLoad; objetivo: AthleteGoal }): CalcResult {
  const t = athleteTargets(p.peso_kg, p.carga, p.objetivo);
  const [w0, w1] = waterNeeds(p.peso_kg);
  const row = (etiqueta: string, r: { gkg: number[]; g: number[] }): CalcRow => ({ etiqueta, valor: `${r.gkg[0]}–${r.gkg[1]} g/kg · ${r.g[0]}–${r.g[1]} g/día` });
  return {
    titulo: "Requerimientos del deportista", datos: [`${p.peso_kg} kg`, `carga ${p.carga}`, `objetivo ${p.objetivo}`],
    resultados: [row("Hidratos de carbono", t.carbs), row("Proteína", t.protein), row("Lípidos", t.fat),
      { etiqueta: "Proteína por comida", valor: `${t.proteinPerMeal[0]}–${t.proteinPerMeal[1]} g`, nota: "0.25–0.40 g/kg, cada 3–4 h" },
      { etiqueta: "Agua base", valor: `${w0}–${w1} ml/día`, nota: "30–35 ml/kg, más las pérdidas por sudor" }],
    avisos: ["Rangos de consenso (ISSN / ACSM); individualiza según deporte, fase y tolerancia."],
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Peso teórico / ideal por varios autores, rango saludable por IMC y peso ajustado. */
export function calcIdealWeight(p: { sexo: "hombre" | "mujer"; talla_cm: number; peso_kg?: number }): CalcResult {
  const sex = SEX(p.sexo), h = p.talla_cm, m2 = (h / 100) ** 2;
  const lor = idealWeight.lorentz(h, sex);
  const resultados: CalcRow[] = [
    { etiqueta: "Lorentz", valor: `${lor} kg`, nota: "H: T − 100 − (T − 150)/4 · M: T − 100 − (T − 150)/2" },
    { etiqueta: "Hamwi", valor: `${idealWeight.hamwi(h, sex)} kg` },
    { etiqueta: "Robinson", valor: `${idealWeight.robinson(h, sex)} kg` },
    { etiqueta: "Devine", valor: `${idealWeight.devine(h, sex)} kg` },
    { etiqueta: "Peso para IMC 22", valor: `${idealWeight.bmiTarget(h)} kg`, nota: "22 × talla²" },
    { etiqueta: "Rango de peso saludable", valor: `${round1(18.5 * m2)}–${round1(24.9 * m2)} kg`, nota: "IMC 18.5–24.9" },
  ];
  if (p.peso_kg) {
    const imc = bmi(p.peso_kg, h);
    resultados.push(
      { etiqueta: "IMC actual", valor: `${imc} kg/m²`, estado: zoneOf(BMI_SCALE, imc).tone, nota: zoneOf(BMI_SCALE, imc).label },
      { etiqueta: "Porcentaje del peso teórico (Lorentz)", valor: `${round1((p.peso_kg / lor) * 100)} %` },
      { etiqueta: "Diferencia con el peso teórico", valor: `${p.peso_kg - lor > 0 ? "+" : ""}${round1(p.peso_kg - lor)} kg` },
      { etiqueta: "Peso ajustado", valor: `${adjustedWeight(p.peso_kg, lor)} kg`, nota: "PI + 0.25 × (PA − PI); úsalo si hay obesidad" },
    );
  }
  return { titulo: "Peso teórico", datos: [sexLabel(sex), `${h} cm`, ...(p.peso_kg ? [`${p.peso_kg} kg`] : [])], formula: ["Peso teórico según Lorentz, Hamwi, Robinson y Devine; peso saludable = IMC × talla²"], resultados };
}

/** Tiempo estimado para llegar a un peso meta con un déficit o superávit diario (≈7700 kcal por kg). */
export function calcWeightProjection(p: { peso_actual_kg: number; peso_meta_kg: number; diferencia_kcal_dia?: number; kg_por_semana?: number }): CalcResult {
  const diff = round1(p.peso_meta_kg - p.peso_actual_kg), losing = diff < 0;
  const avisos: string[] = [];
  let kcalDay = p.diferencia_kcal_dia != null ? Math.abs(p.diferencia_kcal_dia) : null;
  let perWeek = p.kg_por_semana != null ? Math.abs(p.kg_por_semana) : null;
  if (kcalDay == null && perWeek == null) { perWeek = losing ? round1(Math.min(1, p.peso_actual_kg * 0.0075)) : 0.25; avisos.push(`No se indicó ritmo: se usó ${perWeek} kg por semana (${losing ? "≈0.75 % del peso" : "ganancia conservadora"}).`); }
  if (kcalDay == null) kcalDay = Math.round((perWeek! * 7700) / 7);
  if (perWeek == null) perWeek = Math.round(((kcalDay * 7) / 7700) * 100) / 100;
  const weeks = perWeek > 0 ? Math.ceil(Math.abs(diff) / perWeek) : 0;
  if (losing && perWeek > p.peso_actual_kg * 0.01) avisos.push("El ritmo supera 1 % del peso por semana: mayor riesgo de perder masa magra.");
  if (losing && kcalDay > 1000) avisos.push("Déficit mayor a 1000 kcal/día: difícil de sostener y requiere vigilancia.");
  avisos.push("Estimación lineal (7700 kcal ≈ 1 kg); el ritmo real disminuye con la adaptación metabólica.");
  return {
    titulo: "Proyección de peso", datos: [`${p.peso_actual_kg} kg actuales`, `${p.peso_meta_kg} kg meta`],
    formula: ["semanas = |meta − actual| ÷ kg por semana · kg por semana = kcal/día × 7 ÷ 7700"],
    resultados: [
      { etiqueta: losing ? "Por perder" : "Por ganar", valor: `${Math.abs(diff)} kg`, nota: `${round1((Math.abs(diff) / p.peso_actual_kg) * 100)} % del peso actual` },
      { etiqueta: losing ? "Déficit diario" : "Superávit diario", valor: `${kcalDay} kcal/día` },
      { etiqueta: "Ritmo", valor: `${perWeek} kg por semana` },
      { etiqueta: "Tiempo estimado", valor: `${weeks} semanas`, nota: `≈ ${round1(weeks / 4.345)} meses` },
    ], avisos,
  };
}

/** Requerimientos rápidos por kilo de peso: energía, proteína y agua. */
export function calcPerKg(p: { peso_kg: number; kcal_por_kg?: number; proteina_g_por_kg?: number; ml_agua_por_kg?: number }): CalcResult {
  const resultados: CalcRow[] = [];
  if (p.kcal_por_kg != null) resultados.push({ etiqueta: "Energía", valor: `${Math.round(p.kcal_por_kg * p.peso_kg)} kcal/día`, nota: `${p.kcal_por_kg} kcal/kg × ${p.peso_kg} kg` });
  if (p.proteina_g_por_kg != null) resultados.push({ etiqueta: "Proteína", valor: `${round1(p.proteina_g_por_kg * p.peso_kg)} g/día`, nota: `${p.proteina_g_por_kg} g/kg × ${p.peso_kg} kg · ${Math.round(p.proteina_g_por_kg * p.peso_kg * 4)} kcal` });
  if (p.ml_agua_por_kg != null) resultados.push({ etiqueta: "Agua", valor: `${Math.round(p.ml_agua_por_kg * p.peso_kg)} ml/día`, nota: `${p.ml_agua_por_kg} ml/kg × ${p.peso_kg} kg` });
  else { const [a, b] = waterNeeds(p.peso_kg); resultados.push({ etiqueta: "Agua", valor: `${a}–${b} ml/día`, nota: "30–35 ml/kg" }); }
  return { titulo: "Requerimientos por kilo de peso", datos: [`${p.peso_kg} kg`], formula: ["requerimiento = factor × peso"], resultados };
}

/** 1RM estimada y cargas de trabajo. */
export function calcStrength(p: { carga_kg: number; repeticiones: number }): CalcResult {
  const e = oneRepMaxEpley(p.carga_kg, p.repeticiones);
  return {
    titulo: "Fuerza máxima (1RM)", datos: [`${p.carga_kg} kg`, `${p.repeticiones} repeticiones`], formula: ["Epley: carga × (1 + reps ÷ 30) · Brzycki: carga × 36 ÷ (37 − reps)"],
    resultados: [
      { etiqueta: "1RM · Epley", valor: `${e} kg` }, { etiqueta: "1RM · Brzycki", valor: `${oneRepMaxBrzycki(p.carga_kg, p.repeticiones)} kg` },
      ...[60, 70, 80, 90].map((pct) => ({ etiqueta: `Carga al ${pct} %`, valor: `${round1((e * pct) / 100)} kg` })),
    ],
  };
}

/** Operación aritmética exacta con el evaluador seguro (para no hacer cuentas "de cabeza"). */
export function calcExpression(p: { descripcion: string; expresion: string }): CalcResult {
  try {
    const v = evaluateFormula(p.expresion, {});
    return { titulo: "Operación", datos: [p.descripcion], formula: [p.expresion], resultados: [{ etiqueta: "Resultado", valor: String(Math.round(v * 1000) / 1000) }] };
  } catch (e) {
    return { titulo: "Operación", datos: [p.descripcion], resultados: [], avisos: [`No se pudo calcular: ${(e as Error).message}. Usa solo números, + − * / ^, paréntesis y min, max, abs, raiz, redondear.`] };
  }
}
