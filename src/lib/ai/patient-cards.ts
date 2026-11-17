import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ageFromBirthDate, evaluationLabels } from "@/lib/nutrition";
import { LAB_BY_KEY, labFlag } from "@/lib/nutrition/labs";
import type { CalcResult, CalcRow } from "./calc";

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
type Out = Promise<CalcResult | { error: string }>;

/**
 * Datos del expediente para calcular (solo lectura, con la sesión del nutriólogo).
 * Con `anon` no se incluye el nombre: es lo que se envía al modelo en el Copiloto de consulta.
 */
export async function patientCard(supabase: SupabaseClient, id: string, anon = false): Out {
  const [p, a, plan, labs, prog] = await Promise.all([
    supabase.from("patients").select("full_name, birth_date, sex, goal, pathologies, allergies, target_weight_kg").eq("id", id).maybeSingle(),
    supabase.from("anthropometry").select("measured_at, weight_kg, height_cm, circumferences, skinfolds, diameters, bia, results").eq("patient_id", id).order("measured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("meal_plans").select("name, kcal_target, macros, meals").eq("patient_id", id).eq("status", "activo").maybeSingle(),
    supabase.from("lab_results").select("taken_on, values").eq("patient_id", id).order("taken_on", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("progress_logs").select("logged_at, weight_kg, waist_cm, adherence").eq("patient_id", id).order("logged_at", { ascending: false }).limit(5),
  ]);
  if (!p.data) return { error: "No se encontró ese paciente." };
  const d = p.data;
  const age = d.birth_date ? ageFromBirthDate(d.birth_date) : null;
  const datos = [d.sex === "M" ? "hombre" : d.sex === "F" ? "mujer" : "sexo sin registrar", age != null ? `${age} años` : "edad sin registrar"];
  const R: CalcRow[] = [];
  const faltan: string[] = [];
  if (d.goal) R.push({ etiqueta: "Objetivo", valor: d.goal });
  if (d.pathologies?.length) R.push({ etiqueta: "Condiciones", valor: d.pathologies.join(", ") });
  R.push({ etiqueta: "Alergias / intolerancias", valor: d.allergies?.length ? d.allergies.join(", ") : "ninguna registrada" });
  if (d.target_weight_kg) R.push({ etiqueta: "Peso meta", valor: `${Number(d.target_weight_kg)} kg` });

  const m = a.data;
  if (m) {
    const pairs = (o: unknown, unit: string) => Object.entries((o ?? {}) as Record<string, unknown>).filter(([, v]) => num(v)).map(([k, v]) => `${k} ${num(v)} ${unit}`).join(", ");
    if (num(m.weight_kg)) R.push({ etiqueta: "Peso", valor: `${num(m.weight_kg)} kg`, nota: `Medición del ${m.measured_at}` }); else faltan.push("peso");
    if (num(m.height_cm)) R.push({ etiqueta: "Talla", valor: `${num(m.height_cm)} cm` }); else faltan.push("talla");
    const c = pairs(m.circumferences, "cm"), s = pairs(m.skinfolds, "mm"), di = pairs(m.diameters, "cm"), b = pairs(m.bia, "");
    if (c) R.push({ etiqueta: "Circunferencias", valor: c });
    if (s) R.push({ etiqueta: "Pliegues", valor: s });
    if (di) R.push({ etiqueta: "Diámetros", valor: di });
    if (b) R.push({ etiqueta: "Bioimpedancia", valor: b });
    const res = (m.results ?? {}) as Record<string, { value: number | string; label?: string }>;
    for (const k of ["imc", "grasa_pct", "masa_magra_kg", "icc", "ice"]) if (res[k]) R.push({ etiqueta: evaluationLabels[k] ?? k, valor: String(res[k].value), nota: res[k].label });
  } else faltan.push("antropometría (peso y talla)");
  if (!d.sex) faltan.push("sexo");
  if (age == null) faltan.push("fecha de nacimiento");

  if (plan.data) {
    const mc = plan.data.macros as { protein_g?: number; fat_g?: number; carbs_g?: number };
    const meals = (plan.data.meals ?? []) as { name: string; kcal_pct?: number }[];
    R.push({
      etiqueta: `Plan activo · ${plan.data.name}`,
      valor: `${Math.round(Number(plan.data.kcal_target))} kcal · P ${Math.round(mc.protein_g ?? 0)} g · L ${Math.round(mc.fat_g ?? 0)} g · HC ${Math.round(mc.carbs_g ?? 0)} g`,
      nota: meals.map((x) => `${x.name}${x.kcal_pct ? ` ${x.kcal_pct} %` : ""}`).join(", ") || undefined,
    });
  } else R.push({ etiqueta: "Plan activo", valor: "sin plan activo" });

  if (labs.data) {
    for (const [k, v] of Object.entries((labs.data.values ?? {}) as Record<string, unknown>)) {
      const n = num(v), def = LAB_BY_KEY[k];
      if (n == null || !def) continue;
      R.push({ etiqueta: `Lab · ${def.label}`, valor: `${n} ${def.unit}`, estado: labFlag(k, n) ?? undefined, nota: `Tomado el ${labs.data.taken_on}` });
    }
  }
  for (const g of prog.data ?? []) {
    const parts = [num(g.weight_kg) ? `${num(g.weight_kg)} kg` : "", num(g.waist_cm) ? `cintura ${num(g.waist_cm)} cm` : "", num(g.adherence) ? `apego ${num(g.adherence)}` : ""].filter(Boolean);
    if (parts.length) R.push({ etiqueta: `Progreso · ${String(g.logged_at).slice(0, 10)}`, valor: parts.join(" · ") });
  }
  return {
    titulo: `Expediente · ${anon ? "paciente en consulta" : d.full_name}`, datos, resultados: R,
    avisos: faltan.length ? [`Faltan datos en el expediente: ${faltan.join(", ")}. Pídeselos al nutriólogo antes de calcular.`] : [],
  };
}

/** Evolución del paciente: tendencia de peso, ritmo, mediciones en consulta, apego de 14 días y distancia a la meta. */
export async function evolutionCard(supabase: SupabaseClient, id: string, anon = false): Out {
  const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const [p, a, logs, checks, plan] = await Promise.all([
    supabase.from("patients").select("full_name, target_weight_kg").eq("id", id).maybeSingle(),
    supabase.from("anthropometry").select("measured_at, weight_kg, circumferences, results").eq("patient_id", id).order("measured_at").limit(24),
    supabase.from("progress_logs").select("logged_at, weight_kg").eq("patient_id", id).not("weight_kg", "is", null).order("logged_at").limit(60),
    supabase.from("meal_checks").select("day").eq("patient_id", id).eq("done", true).gte("day", since),
    supabase.from("meal_plans").select("meals").eq("patient_id", id).eq("status", "activo").maybeSingle(),
  ]);
  if (!p.data) return { error: "No se encontró ese paciente." };
  const pts = [
    ...(a.data ?? []).filter((x) => num(x.weight_kg)).map((x) => ({ d: String(x.measured_at).slice(0, 10), w: num(x.weight_kg)!, src: "consulta" })),
    ...(logs.data ?? []).map((x) => ({ d: String(x.logged_at).slice(0, 10), w: num(x.weight_kg)!, src: "casa" })),
  ].sort((x, y) => x.d.localeCompare(y.d));
  const R: CalcRow[] = [];
  const avisos: string[] = [];
  if (pts.length >= 2) {
    const f = pts[0], l = pts[pts.length - 1];
    const days = Math.max(1, (Date.parse(l.d) - Date.parse(f.d)) / 864e5), diff = Math.round((l.w - f.w) * 10) / 10;
    R.push({ etiqueta: "Peso inicial", valor: `${f.w} kg`, nota: f.d }, { etiqueta: "Peso más reciente", valor: `${l.w} kg`, nota: `${l.d} · ${l.src}` },
      { etiqueta: "Cambio total", valor: `${diff > 0 ? "+" : ""}${diff} kg`, nota: `${Math.round((diff / f.w) * 1000) / 10} % en ${Math.round(days)} días` },
      { etiqueta: "Ritmo", valor: `${Math.round((diff / days) * 7 * 100) / 100} kg por semana` });
    const goal = num(p.data.target_weight_kg);
    if (goal) R.push({ etiqueta: "Distancia a su meta", valor: `${Math.round(Math.abs(l.w - goal) * 10) / 10} kg`, nota: `Meta ${goal} kg` });
  } else avisos.push("Hay menos de dos registros de peso: no se puede calcular la tendencia.");
  for (const m of (a.data ?? []).slice(-4)) {
    const res = (m.results ?? {}) as Record<string, { value: number | string }>;
    const parts = [num(m.weight_kg) ? `${num(m.weight_kg)} kg` : "", res.imc ? `IMC ${res.imc.value}` : "", res.grasa_pct ? `grasa ${res.grasa_pct.value} %` : "", num((m.circumferences as Record<string, unknown> | null)?.cintura) ? `cintura ${num((m.circumferences as Record<string, unknown>).cintura)} cm` : ""].filter(Boolean);
    if (parts.length) R.push({ etiqueta: `Consulta · ${String(m.measured_at).slice(0, 10)}`, valor: parts.join(" · ") });
  }
  const perDay = ((plan.data?.meals as unknown[]) ?? []).length;
  if (perDay) {
    const done = (checks.data ?? []).length, pct = Math.round((done / (perDay * 14)) * 100);
    R.push({ etiqueta: "Apego en 14 días", valor: `${pct} %`, nota: `${done} de ${perDay * 14} comidas marcadas como hechas`, estado: pct >= 70 ? "normal" : pct >= 40 ? "limite" : "bajo" });
  }
  return { titulo: `Evolución · ${anon ? "paciente en consulta" : p.data.full_name}`, datos: [`${pts.length} registros de peso`], resultados: R, avisos };
}
