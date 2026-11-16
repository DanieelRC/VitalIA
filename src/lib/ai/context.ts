import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ageFromBirthDate } from "@/lib/nutrition";
import { CLINIC_TZ, todayLocal } from "@/lib/time";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const r1 = (v: unknown) => (v == null || v === "" ? null : Math.round(Number(v) * 10) / 10);
const cut = (s: string | null | undefined, n: number) => (s ? (s.length > n ? s.slice(0, n) + "…" : s) : "");

type Meal = { name: string; kcal_pct?: number; equivalents: Record<string, number> };
type MenuItem = { day: number; meal: number; recipe_id?: string | null; text?: string };
type RecallItem = { meal?: string; time?: string; description?: string; quantity?: string | number; kcal?: number };
type Totals = { kcal?: number; protein_g?: number; fat_g?: number; carbs_g?: number };
type Eval = Record<string, { value: number | string; label?: string }>;

/**
 * Contexto del paciente para el asistente. Se arma en el servidor con el cliente del propio
 * usuario (RLS: solo ve lo suyo) y sin nombre, correo ni notas clínicas del nutriólogo.
 */
export async function patientContext(patientId: string) {
  const supabase = await createClient();
  const [p, plan, sups, routines, groups, progress, anthro, recalls, appt] = await Promise.all([
    supabase.from("my_patient").select("birth_date, sex, goal, pathologies, allergies").single(),
    supabase.from("meal_plans").select("name, start_date, kcal_target, macros, meals, menu, recommendations")
      .eq("patient_id", patientId).eq("status", "activo").maybeSingle(),
    supabase.from("patient_supplements").select("dose, schedule, notes, supplements(name)").eq("patient_id", patientId).eq("active", true),
    supabase.from("patient_routines").select("frequency, notes, routines(name, type, items)").eq("patient_id", patientId).eq("active", true),
    supabase.from("equivalent_groups").select("code, name, subgroup"),
    supabase.from("progress_logs").select("logged_at, weight_kg, waist_cm, hip_cm, adherence, exercise_minutes, notes")
      .eq("patient_id", patientId).order("logged_at", { ascending: false }).limit(10),
    supabase.from("my_anthropometry").select("measured_at, weight_kg, height_cm, circumferences, results")
      .eq("patient_id", patientId).order("measured_at", { ascending: false }).limit(3),
    supabase.from("my_recalls").select("recall_date, items, totals")
      .eq("patient_id", patientId).order("recall_date", { ascending: false }).limit(2),
    supabase.from("appointments").select("starts_at, status").eq("patient_id", patientId)
      .in("status", ["solicitada", "confirmada"]).gt("starts_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle(),
  ]);

  const gname = Object.fromEntries((groups.data ?? []).map((g) => [g.code, g.subgroup ? `${g.name} (${g.subgroup})` : g.name]));
  const today = todayLocal();
  const weekday = new Intl.DateTimeFormat("es-MX", { timeZone: CLINIC_TZ, weekday: "long" }).format(new Date());
  const L: string[] = [`Hoy: ${weekday} ${today}`];

  // Perfil
  if (p.data) {
    const d = p.data;
    L.push("", "## Perfil");
    if (d.birth_date) L.push(`Edad: ${ageFromBirthDate(d.birth_date)} años`);
    if (d.sex) L.push(`Sexo: ${d.sex === "F" ? "femenino" : "masculino"}`);
    if (d.goal) L.push(`Objetivo: ${d.goal}`);
    if (d.pathologies?.length) L.push(`Condiciones: ${d.pathologies.join(", ")}`);
    L.push(`Alergias/intolerancias: ${d.allergies?.length ? d.allergies.join(", ") : "ninguna registrada"}`);
  }

  // Plan activo, tiempos de comida y menú
  L.push("", "## Plan de alimentación");
  const kcalTarget = plan.data ? Number(plan.data.kcal_target) : null;
  if (plan.data) {
    const m = plan.data.macros as { protein_g: number; fat_g: number; carbs_g: number };
    L.push(`${plan.data.name}${plan.data.start_date ? ` (desde ${plan.data.start_date})` : ""}: ${Math.round(kcalTarget!)} kcal/día · proteína ${Math.round(m.protein_g)} g · lípidos ${Math.round(m.fat_g)} g · hidratos ${Math.round(m.carbs_g)} g`);
    const meals = plan.data.meals as Meal[];
    L.push("Equivalentes por tiempo de comida:");
    for (const meal of meals) {
      const eq = Object.entries(meal.equivalents ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${gname[k] ?? k}`).join(", ");
      const kcal = meal.kcal_pct ? ` (~${Math.round((kcalTarget! * meal.kcal_pct) / 100)} kcal)` : "";
      L.push(`- ${meal.name}${kcal}: ${eq || "sin equivalentes"}`);
    }
    const menu = (plan.data.menu as MenuItem[]) ?? [];
    if (menu.length) {
      const ids = [...new Set(menu.map((x) => x.recipe_id).filter(Boolean))] as string[];
      const { data: recs } = ids.length ? await supabase.from("recipes").select("id, name, kcal").in("id", ids) : { data: [] };
      const rname = Object.fromEntries((recs ?? []).map((r) => [r.id, `${r.name}${r.kcal ? ` (${Math.round(r.kcal)} kcal)` : ""}`]));
      L.push("Menú semanal:");
      for (let d = 1; d <= 7; d++) {
        const items = menu.filter((x) => x.day === d).sort((a, b) => a.meal - b.meal)
          .map((x) => `${meals[x.meal]?.name ?? "Comida"}: ${(x.recipe_id && rname[x.recipe_id]) || x.text || "—"}`);
        if (items.length) L.push(`- ${DAYS[d - 1]}: ${items.join("; ")}`);
      }
    }
    if (plan.data.recommendations) L.push(`Recomendaciones del nutriólogo: ${cut(plan.data.recommendations, 800)}`);
  } else {
    L.push("Aún no tiene un plan activo publicado por su nutriólogo.");
  }

  // Indicaciones
  const s = (sups.data ?? []).map((x) => [(x.supplements as unknown as { name: string } | null)?.name, x.dose, x.schedule, cut(x.notes, 100)].filter(Boolean).join(" "));
  if (s.length) L.push("", "## Suplementos indicados", ...s.map((x) => `- ${x}`));
  const r = (routines.data ?? []).map((x) => {
    const rt = x.routines as unknown as { name: string; type: string; items: { name: string; sets?: number; reps?: string | number; duration_min?: number }[] } | null;
    const ex = (rt?.items ?? []).slice(0, 8).map((i) => `${i.name}${i.sets ? ` ${i.sets}×${i.reps ?? ""}` : ""}${i.duration_min ? ` ${i.duration_min} min` : ""}`).join(", ");
    return `${rt?.name ?? "Rutina"} (${rt?.type ?? ""}${x.frequency ? `, ${x.frequency}` : ""})${ex ? `: ${ex}` : ""}`;
  });
  if (r.length) L.push("", "## Rutinas asignadas", ...r.map((x) => `- ${x}`));

  // Mediciones en consulta
  if (anthro.data?.length) {
    L.push("", "## Mediciones en consulta (más reciente primero)");
    for (const a of anthro.data) {
      const res = (a.results ?? {}) as Eval;
      const c = (a.circumferences ?? {}) as Record<string, number>;
      const parts = [
        a.weight_kg && `peso ${r1(a.weight_kg)} kg`,
        res.imc && `IMC ${r1(res.imc.value)}${res.imc.label ? ` (${res.imc.label})` : ""}`,
        res.grasa_pct && `grasa ${r1(res.grasa_pct.value)} %`,
        c.cintura && `cintura ${c.cintura} cm`,
        res.ice && `índice cintura-estatura ${res.ice.value}${res.ice.label ? ` (${res.ice.label})` : ""}`,
      ].filter(Boolean);
      L.push(`- ${a.measured_at}: ${parts.join(", ") || "sin datos"}`);
    }
  }

  // Registro de progreso en casa
  if (progress.data?.length) {
    L.push("", "## Registros de progreso del paciente (más reciente primero)");
    for (const g of progress.data) {
      const parts = [
        g.weight_kg && `peso ${r1(g.weight_kg)} kg`,
        g.waist_cm && `cintura ${g.waist_cm} cm`,
        g.hip_cm && `cadera ${g.hip_cm} cm`,
        g.adherence && `apego ${g.adherence}/5`,
        g.exercise_minutes && `ejercicio ${g.exercise_minutes} min`,
        g.notes && `nota: "${cut(g.notes, 120)}"`,
      ].filter(Boolean);
      L.push(`- ${g.logged_at}: ${parts.join(", ")}`);
    }
    const w = progress.data.filter((g) => g.weight_kg != null);
    if (w.length >= 2) {
      const diff = r1(Number(w[0].weight_kg) - Number(w[w.length - 1].weight_kg));
      L.push(`Cambio de peso entre ${w[w.length - 1].logged_at} y ${w[0].logged_at}: ${diff! > 0 ? "+" : ""}${diff} kg`);
    }
  }

  // Recordatorios de 24 h
  if (recalls.data?.length) {
    L.push("", "## Recordatorios de 24 h (lo que comió)");
    for (const rc of recalls.data) {
      const t = (rc.totals ?? {}) as Totals;
      const vs = kcalTarget && t.kcal ? ` = ${Math.round((t.kcal / kcalTarget) * 100)} % de su meta` : "";
      L.push(`- ${rc.recall_date}: ${t.kcal ? `${Math.round(t.kcal)} kcal${vs}` : ""}${t.protein_g ? ` · P ${Math.round(t.protein_g)} g · L ${Math.round(t.fat_g ?? 0)} g · HC ${Math.round(t.carbs_g ?? 0)} g` : ""}`);
      for (const it of ((rc.items ?? []) as RecallItem[]).slice(0, 25)) {
        L.push(`  · ${it.meal ?? ""}${it.time ? ` ${it.time}` : ""}: ${cut(it.description, 80)}${it.quantity ? ` (${it.quantity})` : ""}${it.kcal ? ` ~${Math.round(it.kcal)} kcal` : ""}`);
      }
    }
  }

  // Próxima cita
  if (appt.data) {
    const when = new Intl.DateTimeFormat("es-MX", { timeZone: CLINIC_TZ, dateStyle: "full", timeStyle: "short" }).format(new Date(appt.data.starts_at));
    L.push("", `## Próxima cita: ${when} (${appt.data.status})`);
  }

  return `<contexto_paciente>\n${L.join("\n")}\n</contexto_paciente>`;
}
