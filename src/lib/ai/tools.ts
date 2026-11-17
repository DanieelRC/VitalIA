import "server-only";
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ageFromBirthDate, energyFormulas, mealDistributionPresets, splitEquivalentsByMeals, suggestDailyEquivalents, type EnergyFormula, type Group } from "@/lib/nutrition";
import { LABS } from "@/lib/nutrition/labs";
import {
  calcAthlete, calcBody, calcExpression, calcIdealWeight, calcPerKg, calcStrength, calcWeightProjection, calcEnergy, calcEquivalents, calcExercise, calcLabs, calcMacros, calcPregnancy, calcSomatotype,
  type CalcResult,
} from "./calc";
import { evidenceGuard } from "./evidence";
import { evolutionCard, patientCard } from "./patient-cards";

const sexo = z.enum(["hombre", "mujer"]).describe("Sexo biológico");
const peso = z.number().min(2).max(400).describe("Peso en kg");
const talla = z.number().min(40).max(250).describe("Talla en cm");
const edad = z.number().min(0).max(120).describe("Edad en años");
const FORMULAS = Object.keys(energyFormulas) as [EnergyFormula, ...EnergyFormula[]];
const mm = z.number().min(1).max(80);


/**
 * Herramientas del asistente del nutriólogo. Todas son de solo lectura: calculan con las fórmulas de la app
 * o leen el expediente con la sesión del propio nutriólogo (RLS). `onCard` recibe cada resultado para guardarlo.
 */
export function proTools(supabase: SupabaseClient, onCard: (c: CalcResult) => void, conversation: string, current?: { id: string; weightKg?: number }) {
  const guard = evidenceGuard(conversation);
  const card = (c: CalcResult) => { onCard(c); guard.add(JSON.stringify(c)); return c; };
  const give = (c: CalcResult | { error: string }) => ("error" in c ? c : card(c));
  /** Acepta el id o el nombre del paciente. Con varios homónimos devuelve la lista para que el modelo pregunte cuál. */
  const resolvePatient = async (ref: string): Promise<{ id: string } | { error: string }> => {
    const v = ref.trim();
    // Copiloto de consulta: "actual" es el paciente del expediente abierto
    if (current && (v === current.id || /^(el |la )?(paciente )?(actual|en consulta|este|esta)$|^(el |la )?paciente$/i.test(v))) return { id: current.id };
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) && !/^0{8}-/.test(v)) return { id: v };
    const q = v.replace(/[%_,()\\]/g, " ").trim();
    if (q.length < 2 || /^0{8}-/.test(v)) return { error: "Indica el nombre del paciente." };
    const { data } = await supabase.from("patients").select("id, full_name").eq("active", true).ilike("full_name", `%${q}%`).order("full_name").limit(6);
    if (!data?.length) return { error: `No hay ningún paciente activo que coincida con "${q}". Dilo así y pide el nombre correcto.` };
    if (data.length > 1) return { error: `Hay ${data.length} pacientes que coinciden: ${data.map((d) => d.full_name).join(", ")}. Pregunta al nutriólogo a cuál se refiere.` };
    return { id: data[0].id as string };
  };
  const groups = async () => ((await supabase.from("equivalent_groups").select("code, name, subgroup, kcal, protein_g, fat_g, carbs_g").order("sort")).data ?? []) as Group[];

  return {
    calcular_gasto_energetico: tool({
      description: "Calcula el gasto energético basal (GEB) y total (GET) con las fórmulas de la app (Harris-Benedict, Mifflin-St Jeor, FAO/OMS, Schofield, Valencia, Owen, Katch-McArdle, Cunningham) y las fórmulas propias del consultorio. Requiere sexo, peso, talla y edad.",
      inputSchema: z.object({
        sexo, peso_kg: peso, talla_cm: talla, edad,
        masa_libre_grasa_kg: z.number().min(1).max(200).optional().describe("Necesaria para Katch-McArdle y Cunningham"),
        formulas: z.array(z.enum(FORMULAS)).optional().describe("Fórmulas a usar; si se omite, se calculan todas para comparar"),
        factor_actividad: z.number().min(1).max(2.5).optional().describe("1.2 sedentario, 1.375 ligera, 1.55 moderada, 1.725 intensa, 1.9 muy intensa"),
        factor_estres: z.number().min(0.5).max(3).optional(),
        eta_pct: z.number().min(0).max(20).optional().describe("Efecto térmico de los alimentos, % del GEB (10 por defecto)"),
        ajuste_kcal: z.number().min(-2000).max(2000).optional().describe("kcal que se suman o restan al GET (p. ej. -500 para déficit)"),
      }),
      execute: async (p) => {
        const bad = guard.check({ peso_kg: p.peso_kg, talla_cm: p.talla_cm, edad: p.edad, masa_libre_grasa_kg: p.masa_libre_grasa_kg }, p.sexo);
        if (bad) return bad;
        const { data } = await supabase.from("custom_formulas").select("name, expression").order("created_at");
        return card(calcEnergy({ ...p, propias: p.formulas?.length ? [] : (data ?? []) }));
      },
    }),

    evaluar_composicion_corporal: tool({
      description: "Evalúa antropometría: IMC, peso ideal y ajustado, índices cintura-cadera y cintura-estatura, complexión, % de grasa por pliegues (Durnin-Womersley, Jackson-Pollock), masa grasa y magra, masa muscular (Lee).",
      inputSchema: z.object({
        sexo, edad, peso_kg: peso, talla_cm: talla,
        cintura_cm: z.number().min(30).max(250).optional(), cadera_cm: z.number().min(30).max(250).optional(),
        muneca_cm: z.number().min(8).max(30).optional(), brazo_cm: z.number().min(10).max(80).optional(), pantorrilla_cm: z.number().min(15).max(80).optional(),
        pliegues_mm: z.object({
          triceps: mm.optional(), biceps: mm.optional(), subescapular: mm.optional(), suprailiaco: mm.optional(), abdominal: mm.optional(),
          muslo: mm.optional(), pecho: mm.optional(), axilar: mm.optional(), pantorrilla: mm.optional(),
        }).optional().describe("Pliegues cutáneos en mm"),
      }),
      execute: async (p) => guard.check({ peso_kg: p.peso_kg, talla_cm: p.talla_cm, edad: p.edad, cintura_cm: p.cintura_cm, cadera_cm: p.cadera_cm, ...p.pliegues_mm }, p.sexo) ?? card(calcBody(p)),
    }),

    distribuir_macronutrientes: tool({
      description: "Convierte una distribución de macronutrientes a gramos, kcal, % y g/kg, y valora si está dentro de los rangos aceptables (AMDR). Cada macronutriente puede ir en porcentaje o en g/kg: p. ej. proteína 1.6 g/kg (unidad g_por_kg) con lípidos 30 % (unidad_lipidos porcentaje). Una sola llamada basta: no calcules gramos aparte.",
      inputSchema: z.object({
        kcal: z.number().min(500).max(8000).describe("Energía total del plan"),
        peso_kg: peso.optional().describe("Obligatorio si alguna unidad es g_por_kg"),
        unidad: z.enum(["porcentaje", "g_por_kg"]).describe("Unidad de la proteína (y de los demás si no se indica otra)"),
        unidad_lipidos: z.enum(["porcentaje", "g_por_kg"]).optional(), unidad_hidratos: z.enum(["porcentaje", "g_por_kg"]).optional(),
        proteina: z.number().min(0).max(100), lipidos: z.number().min(0).max(100),
        hidratos: z.number().min(0).max(100).optional().describe("Si se omite, completa la energía restante"),
      }),
      execute: async (p) => {
        // Entradas tolerantes: el modelo suele omitir el peso o mezclar unidades
        const q = { ...p, peso_kg: p.peso_kg ?? current?.weightKg, hidratos: p.hidratos || undefined };
        const notes: string[] = [];
        for (const [k, unitKey, name] of [["proteina", "unidad", "proteína"], ["lipidos", "unidad_lipidos", "lípidos"], ["hidratos", "unidad_hidratos", "hidratos"]] as const) {
          const unit = (k === "proteina" ? q.unidad : q[unitKey] ?? q.unidad), v = q[k];
          if (unit === "g_por_kg" && v != null && v > 12) {
            if (k === "proteina") return { error: `${v} g/kg de proteína no es plausible. Si es porcentaje usa unidad "porcentaje".` };
            (q as Record<string, unknown>)[unitKey] = "porcentaje";
            notes.push(`${name} ${v} se interpretó como porcentaje.`);
          }
        }
        const bad = guard.check({ kcal: q.kcal, peso_kg: q.peso_kg });
        if (bad) return bad;
        const res = calcMacros(q);
        if (notes.length) res.avisos = [...(res.avisos ?? []), ...notes];
        // Sin resultados = entrada incompleta: se le explica al modelo y no se muestra tarjeta
        return res.resultados.length ? card(res) : { error: `${res.avisos?.[0] ?? "Entrada incompleta."} Repite la llamada incluyendo peso_kg con el peso del expediente o de la conversación.` };
      },
    }),

    calcular_equivalentes: tool({
      description: "Propone equivalentes diarios por grupo del SMAE para una meta de energía y macronutrientes, con su adecuación, y opcionalmente los reparte por tiempos de comida.",
      inputSchema: z.object({
        kcal: z.number().min(500).max(8000), proteina_g: z.number().min(0).max(600), lipidos_g: z.number().min(0).max(500), hidratos_g: z.number().min(0).max(1200),
        tiempos: z.array(z.object({ nombre: z.string().max(40), porcentaje: z.number().min(0).max(100) })).max(8).optional().describe("Tiempos de comida con su % de la energía (deben sumar 100)"),
      }),
      execute: async (p) => guard.check({ kcal: p.kcal }) ?? card(calcEquivalents(p, await groups())),
    }),

    interpretar_laboratorios: tool({
      description: `Compara resultados de laboratorio con los rangos de referencia de la app. Analitos: ${LABS.map((l) => `${l.key} (${l.unit})`).join(", ")}.`,
      inputSchema: z.object({ valores: z.array(z.object({ analito: z.string().max(30), valor: z.number() })).min(1).max(20) }),
      execute: async (p) => guard.check(Object.fromEntries(p.valores.map((v) => [v.analito, v.valor]))) ?? card(calcLabs(Object.fromEntries(p.valores.map((v) => [v.analito, v.valor])))),
    }),

    calcular_ejercicio: tool({
      description: "Frecuencia cardiaca máxima (Tanaka y 220 − edad), zonas de entrenamiento por Karvonen y gasto energético de una sesión por MET.",
      inputSchema: z.object({
        edad, fc_reposo: z.number().min(30).max(130).optional(), peso_kg: peso.optional(),
        met: z.number().min(1).max(25).optional(), minutos: z.number().min(1).max(600).optional(),
      }),
      execute: async (p) => guard.check({ edad: p.edad, fc_reposo: p.fc_reposo, peso_kg: p.peso_kg, met: p.met, minutos: p.minutos }) ?? card(calcExercise(p)),
    }),

    calcular_somatotipo: tool({
      description: "Somatotipo antropométrico de Heath-Carter (endomorfia, mesomorfia, ectomorfia) y coordenadas de la somatocarta.",
      inputSchema: z.object({
        peso_kg: peso, talla_cm: talla,
        pliegue_triceps_mm: mm, pliegue_subescapular_mm: mm, pliegue_supraespinal_mm: mm, pliegue_pantorrilla_mm: mm,
        diametro_humero_cm: z.number().min(3).max(12), diametro_femur_cm: z.number().min(5).max(15),
        brazo_flexionado_cm: z.number().min(15).max(70), pantorrilla_cm: z.number().min(20).max(70),
      }),
      execute: async (p) => guard.check(p) ?? card(calcSomatotype({
        weightKg: p.peso_kg, heightCm: p.talla_cm, triceps: p.pliegue_triceps_mm, subscapular: p.pliegue_subescapular_mm,
        supraspinale: p.pliegue_supraespinal_mm, calfSkinfold: p.pliegue_pantorrilla_mm, humerus: p.diametro_humero_cm,
        femur: p.diametro_femur_cm, armFlexed: p.brazo_flexionado_cm, calf: p.pantorrilla_cm,
      })),
    }),

    calcular_embarazo: tool({
      description: "Ganancia de peso recomendada en el embarazo según el IMC pregestacional (IOM 2009), peso esperado a la semana indicada y energía adicional por trimestre.",
      inputSchema: z.object({
        peso_pregestacional_kg: peso, talla_cm: talla, semana: z.number().int().min(1).max(42), peso_actual_kg: peso.optional(),
      }),
      execute: async (p) => guard.check(p) ?? card(calcPregnancy(p)),
    }),

    calcular_deportista: tool({
      description: "Metas de hidratos, proteína y lípidos en g/kg y g/día para deportistas según carga de entrenamiento y objetivo (ISSN / ACSM).",
      inputSchema: z.object({
        peso_kg: peso,
        carga: z.enum(["ligero", "moderado", "alto", "muy_alto"]).describe("ligero: baja intensidad · moderado: ~1 h/día · alto: 1–3 h/día · muy_alto: >4 h/día"),
        objetivo: z.enum(["mantener", "hipertrofia", "deficit"]),
      }),
      execute: async (p) => guard.check({ peso_kg: p.peso_kg }) ?? card(calcAthlete(p)),
    }),

    calcular_peso_teorico: tool({
      description: "Peso teórico o ideal (Lorentz, Hamwi, Robinson, Devine, IMC 22), rango de peso saludable y, si se da el peso actual, IMC, % del peso teórico y peso ajustado. Úsala para cualquier pregunta de peso ideal, teórico, saludable o ajustado.",
      inputSchema: z.object({ sexo, talla_cm: talla, peso_kg: peso.optional().describe("Peso actual, si se conoce") }),
      execute: async (p) => guard.check({ talla_cm: p.talla_cm, peso_kg: p.peso_kg }, p.sexo) ?? card(calcIdealWeight(p)),
    }),

    proyectar_peso: tool({
      description: "Calcula cuántas semanas tomaría llegar a un peso meta con un déficit o superávit diario (kcal) o un ritmo semanal (kg). Si no se da ritmo, usa uno conservador y lo avisa.",
      inputSchema: z.object({
        peso_actual_kg: peso, peso_meta_kg: peso,
        diferencia_kcal_dia: z.number().min(50).max(2000).optional().describe("Déficit o superávit diario en kcal (valor positivo)"),
        kg_por_semana: z.number().min(0.05).max(2).optional(),
      }),
      execute: async (p) => guard.check(p) ?? card(calcWeightProjection(p)),
    }),

    calcular_por_kilo: tool({
      description: "Requerimientos rápidos por kilo de peso: energía (kcal/kg), proteína (g/kg) y agua (ml/kg; 30–35 si no se indica).",
      inputSchema: z.object({
        peso_kg: peso, kcal_por_kg: z.number().min(5).max(80).optional(), proteina_g_por_kg: z.number().min(0.3).max(4).optional(), ml_agua_por_kg: z.number().min(15).max(60).optional(),
      }),
      execute: async (p) => guard.check(p) ?? card(calcPerKg(p)),
    }),

    calcular_fuerza_maxima: tool({
      description: "Estima la repetición máxima (1RM) con Epley y Brzycki y las cargas al 60–90 %.",
      inputSchema: z.object({ carga_kg: z.number().min(1).max(600), repeticiones: z.number().int().min(1).max(20) }),
      execute: async (p) => guard.check(p) ?? card(calcStrength(p)),
    }),

    calcular_operacion: tool({
      description: "Calculadora exacta para cualquier operación aritmética que no cubra otra herramienta (sumas, promedios, porcentajes, reglas de tres, conversiones). Escribe la expresión solo con números y + - * / ^ ( ) y las funciones min, max, abs, raiz, redondear. Todos los números deben venir de la conversación o de otra herramienta, salvo constantes de conversión.",
      inputSchema: z.object({ descripcion: z.string().max(120).describe("Qué se está calculando"), expresion: z.string().min(1).max(200) }),
      execute: async (p) => card(calcExpression(p)),
    }),

    buscar_alimento: tool({
      description: "Busca alimentos en el catálogo del consultorio (SMAE y propios) por nombre: porción, energía, macronutrientes, fibra, sodio y grupo de equivalentes. Úsala en vez de citar valores de memoria.",
      inputSchema: z.object({ nombre: z.string().min(2).max(60) }),
      execute: async ({ nombre }) => {
        const q = nombre.replace(/[%_,()\\]/g, " ").trim();
        const { data } = await supabase.from("foods").select("name, portion, portion_g, kcal, protein_g, fat_g, carbs_g, fiber_g, sodium_mg, group_code").ilike("name", `%${q}%`).order("name").limit(8);
        if (!data?.length) return { error: `No hay alimentos que coincidan con "${nombre}" en el catálogo. Dilo así; no inventes su aporte.` };
        return card({
          titulo: `Alimentos · "${nombre}"`, datos: ["Aporte por porción del catálogo"],
          resultados: data.map((f) => ({
            etiqueta: `${f.name} · ${f.portion}${f.portion_g ? ` (${Number(f.portion_g)} g)` : ""}`,
            valor: `${Math.round(Number(f.kcal))} kcal · P ${Number(f.protein_g)} · L ${Number(f.fat_g)} · HC ${Number(f.carbs_g)} g`,
            nota: [f.group_code ? `Grupo ${f.group_code}` : "", f.fiber_g != null ? `fibra ${Number(f.fiber_g)} g` : "", f.sodium_mg != null ? `sodio ${Number(f.sodium_mg)} mg` : ""].filter(Boolean).join(" · ") || undefined,
          })),
        });
      },
    }),

    buscar_recetas: tool({
      description: "Busca recetas del recetario del consultorio por nombre, tiempo de comida, condición clínica y energía máxima. Devuelve nombre, energía, macronutrientes y etiquetas. Úsala para proponer menús con recetas reales en lugar de inventarlas.",
      inputSchema: z.object({
        texto: z.string().max(60).optional(), tiempo: z.enum(["desayuno", "colacion", "comida", "cena"]).optional(),
        condicion: z.enum(["normal", "diabetes", "hipertension", "renal", "dislipidemia", "celiaquia", "sii", "embarazo", "vegetariana", "alta_proteina"]).optional(),
        kcal_max: z.number().min(50).max(2000).optional(),
      }),
      execute: async (p) => {
        // Palabras genéricas ("cena", "receta", "diabetes") no son parte del nombre del platillo
        const texto = (p.texto ?? "").replace(/[%_,()\\]/g, " ").trim();
        const generic = /^(recetas?|platillos?|comidas?|cenas?|desayunos?|colaci[oó]n(es)?|snacks?|opciones|men[uú]s?|diabetes|saludables?|ligeras?|bajas? en .*)$/i.test(texto);
        const run = async (withText: boolean) => {
          let q = supabase.from("recipes").select("name, meal_time, tags, kcal, protein_g, fat_g, carbs_g").order("kcal", { ascending: false }).limit(10);
          if (withText) q = q.ilike("name", `%${texto}%`);
          if (p.tiempo) q = q.eq("meal_time", p.tiempo);
          if (p.condicion) q = q.contains("tags", [p.condicion]);
          if (p.kcal_max) q = q.lte("kcal", p.kcal_max);
          return (await q).data ?? [];
        };
        let data = await run(!!texto && !generic);
        if (!data.length && texto && !generic) data = await run(false);
        if (!data?.length) return { error: "No hay recetas con esos criterios en el recetario. Dilo así y sugiere ampliar la búsqueda; no inventes recetas como si estuvieran en el catálogo." };
        return card({
          titulo: "Recetas del recetario", datos: [p.tiempo, p.condicion, p.kcal_max ? `≤ ${p.kcal_max} kcal` : ""].filter(Boolean) as string[],
          resultados: data.map((r) => ({ etiqueta: `${r.name} · ${r.meal_time}`, valor: `${Math.round(Number(r.kcal ?? 0))} kcal · P ${Number(r.protein_g ?? 0)} · L ${Number(r.fat_g ?? 0)} · HC ${Number(r.carbs_g ?? 0)} g`, nota: (r.tags as string[]).join(", ") || undefined })),
        });
      },
    }),

    evolucion_paciente: tool({
      description: "Evolución de un paciente: mediciones en consulta (peso, IMC, % de grasa, cintura), registros en casa, cambio total y ritmo semanal, apego de los últimos 14 días (comidas marcadas como hechas) y distancia a su peso meta. Acepta el nombre del paciente.",
      inputSchema: z.object({ paciente: z.string().min(2).max(80).describe("Nombre del paciente (o su id)") }),
      execute: async ({ paciente }) => {
        const found = await resolvePatient(paciente);
        if ("error" in found) return found;
        const id = found.id;
        return give(await evolutionCard(supabase, id, id === current?.id));
      },
    }),

    comparar_valores: tool({
      description: "Resta y compara dos cifras ya conocidas (p. ej. energía del plan contra el GET, peso actual contra peso meta). Úsala en lugar de restar o sacar porcentajes por tu cuenta.",
      inputSchema: z.object({
        etiqueta_a: z.string().max(60), valor_a: z.number(), etiqueta_b: z.string().max(60), valor_b: z.number(), unidad: z.string().max(12),
      }),
      execute: async (p) => {
        const bad = guard.check({ [p.etiqueta_a]: p.valor_a, [p.etiqueta_b]: p.valor_b });
        if (bad) return bad;
        const diff = Math.round((p.valor_a - p.valor_b) * 10) / 10;
        const pct = p.valor_b ? Math.round((p.valor_a / p.valor_b) * 1000) / 10 : null;
        return card({
          titulo: "Comparación", datos: [`${p.etiqueta_a}: ${p.valor_a} ${p.unidad}`, `${p.etiqueta_b}: ${p.valor_b} ${p.unidad}`],
          formula: ["diferencia = A − B · proporción = A ÷ B × 100"],
          resultados: [
            { etiqueta: `${p.etiqueta_a} − ${p.etiqueta_b}`, valor: `${diff > 0 ? "+" : ""}${diff} ${p.unidad}` },
            ...(pct != null ? [{ etiqueta: `${p.etiqueta_a} respecto a ${p.etiqueta_b}`, valor: `${pct} %` }] : []),
          ],
        });
      },
    }),

    buscar_paciente: tool({
      description: "Lista pacientes del consultorio cuyo nombre coincide. Solo hace falta cuando el nombre es ambiguo o se pide una lista: consultar_paciente y evolucion_paciente ya aceptan el nombre directamente.",
      inputSchema: z.object({ nombre: z.string().min(2).max(60) }),
      execute: async ({ nombre }) => {
        const q = nombre.replace(/[%_,()\\]/g, " ").trim();
        const { data } = await supabase.from("patients").select("id, full_name, birth_date, sex").eq("active", true).ilike("full_name", `%${q}%`).order("full_name").limit(6);
        guard.add(JSON.stringify(data ?? []));
        return {
          encontrados: (data ?? []).map((p) => ({
            paciente_id: p.id as string, nombre: p.full_name as string,
            edad: p.birth_date ? ageFromBirthDate(p.birth_date) : null, sexo: p.sex === "M" ? "hombre" : p.sex === "F" ? "mujer" : null,
          })),
        };
      },
    }),

    consultar_paciente: tool({
      description: "Lee los datos de un paciente para calcular con ellos: edad, sexo, objetivo, condiciones, alergias, última antropometría (peso, talla, circunferencias, pliegues, resultados), plan activo, últimos laboratorios y progreso reciente. No modifica nada.",
      inputSchema: z.object({ paciente: z.string().min(2).max(80).describe("Nombre del paciente (o su id)") }),
      execute: async ({ paciente }) => {
        const found = await resolvePatient(paciente);
        if ("error" in found) return found;
        const id = found.id;
        return give(await patientCard(supabase, id, id === current?.id));
      },
    }),

    // ---- Copiloto de consulta: borradores que el nutriólogo aplica con un botón (nada se guarda desde aquí)
    ...(current ? {
      proponer_plan: tool({
        description: "COPILOTO. Arma el borrador de un plan de alimentación para el paciente en consulta: energía, macronutrientes y equivalentes repartidos por tiempo de comida. Usa la energía y los gramos EXACTOS que devolvieron calcular_gasto_energetico y distribuir_macronutrientes. No guarda nada: el nutriólogo lo aplica con un botón y lo afina en el estudio.",
        inputSchema: z.object({
          kcal: z.number().min(500).max(8000), proteina_g: z.number().min(0).max(600), lipidos_g: z.number().min(0).max(500), hidratos_g: z.number().min(0).max(1200),
          nombre: z.string().max(80).optional().describe("Nombre del plan, p. ej. 'Plan hipocalórico'"),
          tiempos: z.array(z.object({ nombre: z.string().min(1).max(40), porcentaje: z.number().min(0).max(100) })).min(1).max(8).optional().describe("Tiempos de comida con su % de energía (suman 100). Si se omite: desayuno 25, colación 10, comida 40, cena 25"),
          recomendaciones: z.string().max(1500).optional().describe("Recomendaciones generales para el paciente, en lenguaje sencillo"),
        }),
        execute: async (p) => {
          const bad = guard.check({ kcal: p.kcal, "proteína (g)": p.proteina_g, "lípidos (g)": p.lipidos_g, "hidratos (g)": p.hidratos_g });
          if (bad) return { error: `${bad.error} La energía sale de calcular_gasto_energetico y los gramos de distribuir_macronutrientes.` };
          const tiempos = p.tiempos ?? mealDistributionPresets[1].meals.map((m) => ({ nombre: m.name, porcentaje: m.kcal_pct }));
          const sum = tiempos.reduce((a, m) => a + m.porcentaje, 0);
          if (Math.abs(sum - 100) > 0.5) return { error: `Los tiempos suman ${sum} %; deben sumar 100 %.` };
          const g = await groups();
          const base = calcEquivalents({ ...p, tiempos }, g);
          const split = splitEquivalentsByMeals(suggestDailyEquivalents(p.kcal, { protein_g: p.proteina_g, fat_g: p.lipidos_g, carbs_g: p.hidratos_g }, g), tiempos.map((m) => ({ kcal_pct: m.porcentaje })));
          const pct = (grams: number, f: number) => Math.round(((grams * f) / p.kcal) * 1000) / 10;
          const name = (p.nombre ?? "Plan de alimentación").trim() || "Plan de alimentación";
          return card({
            ...base, titulo: `Borrador de plan · ${name}`,
            texto: p.recomendaciones ? [{ titulo: "Recomendaciones", cuerpo: p.recomendaciones }] : undefined,
            avisos: ["Borrador: al aplicarlo se crea un plan sin activar; revisa la adecuación en el estudio antes de activarlo."],
            accion: {
              tipo: "plan",
              plan: {
                name, kcal_target: p.kcal,
                macros: { mode: "porcentaje", protein_g: p.proteina_g, fat_g: p.lipidos_g, carbs_g: p.hidratos_g, protein_pct: pct(p.proteina_g, 4), fat_pct: pct(p.lipidos_g, 9), carbs_pct: pct(p.hidratos_g, 4) },
                meals: tiempos.map((m, i) => ({ name: m.nombre, kcal_pct: m.porcentaje, equivalents: Object.fromEntries(Object.entries(split[i]).filter(([, v]) => v > 0)) })),
                recommendations: p.recomendaciones ?? null,
              },
            },
          });
        },
      }),

      redactar_nota: tool({
        description: "COPILOTO. Deja el borrador de la nota SOAP de esta consulta, con diagnósticos PES. Escribe solo lo que conste en la conversación o en el expediente: no inventes síntomas, hábitos ni cifras; si no tienes el subjetivo (lo que refiere el paciente), pídelo antes. No guarda nada: el nutriólogo crea la nota con un botón, la corrige y la firma.",
        inputSchema: z.object({
          motivo: z.string().max(300).optional().describe("Motivo de consulta"),
          subjetivo: z.string().min(3).max(3000), objetivo: z.string().min(3).max(3000), analisis: z.string().min(3).max(3000), plan: z.string().min(3).max(3000),
          diagnosticos_pes: z.array(z.object({
            dominio: z.enum(["ingestion", "clinico", "conductual"]), problema: z.string().min(2).max(300),
            etiologia: z.string().min(2).max(600).describe("relacionado con…"), signos: z.string().min(2).max(600).describe("evidenciado por…"),
          })).max(4).optional(),
        }),
        execute: async (p) => {
          // El modelo a veces repite los conectores que la app ya pone
          const strip = (v: string) => v.replace(/^(relacionad[oa] (con|a)|evidenciad[oa] por|manifestad[oa] por)\s*:?\s*/i, "").replace(/\.$/, "");
          const pes = (p.diagnosticos_pes ?? []).map((d) => ({ ...d, etiologia: strip(d.etiologia), signos: strip(d.signos) }));
          const loose = guard.unsupported([p.subjetivo, p.objetivo, p.analisis, p.plan, ...pes.map((d) => d.signos)].join("\n"));
          return card({
            titulo: "Borrador de nota SOAP", datos: p.motivo ? [p.motivo] : [], resultados: [],
            texto: [
              { titulo: "S · Subjetivo", cuerpo: p.subjetivo }, { titulo: "O · Objetivo", cuerpo: p.objetivo }, { titulo: "A · Análisis", cuerpo: p.analisis }, { titulo: "P · Plan", cuerpo: p.plan },
              ...pes.map((d, i) => ({ titulo: `PES ${i + 1}`, cuerpo: `${d.problema} relacionado con ${d.etiologia}, evidenciado por ${d.signos}.` })),
            ],
            avisos: [
              ...(loose.length ? [`Cifras que no encontré en el expediente ni en la conversación: ${loose.join(", ")}. Verifícalas.`] : []),
              "Borrador: la nota es tu responsabilidad profesional; revísala antes de firmar.",
            ],
            accion: { tipo: "nota", nota: { reason: p.motivo, subjective: p.subjetivo, objective: p.objetivo, assessment: p.analisis, plan: p.plan, pes: pes.map((d) => ({ domain: d.dominio, problem: d.problema, etiology: d.etiologia, signs: d.signos })) } },
          });
        },
      }),

      redactar_mensaje_paciente: tool({
        description: "COPILOTO. Deja el borrador del mensaje de cierre para el paciente: lo acordado hoy y los próximos pasos, en lenguaje sencillo, cálido y sin tecnicismos. No incluyas diagnósticos, notas clínicas ni interpretaciones de laboratorio. No envía nada: el nutriólogo lo edita y lo envía con un botón.",
        inputSchema: z.object({ mensaje: z.string().min(20).max(1500) }),
        execute: async ({ mensaje }) => card({
          titulo: "Borrador de mensaje para el paciente", datos: [], resultados: [],
          avisos: ["El paciente lo recibirá en Mensajes de su portal. Edítalo antes de enviarlo."],
          accion: { tipo: "mensaje", mensaje },
        }),
      }),
    } : {}),
  };
}
