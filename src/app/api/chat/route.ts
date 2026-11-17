import { createXai } from "@ai-sdk/xai";
import { createUIMessageStream, createUIMessageStreamResponse, generateId, stepCountIs, streamText, toUIMessageStream, type ModelMessage } from "ai";
import { z } from "zod";
import { createAdminClient, createClient, getSession } from "@/lib/supabase/server";
import { costUsd, estimateCost, LIMIT_MESSAGES, parsePrices } from "@/lib/ai/budget";
import { patientContext } from "@/lib/ai/context";
import { sanitize, screenInput } from "@/lib/ai/guard";
import { COPILOT_SYSTEM, PATIENT_SYSTEM, PRO_SYSTEM } from "@/lib/ai/prompts";
import { evolutionCard, patientCard } from "@/lib/ai/patient-cards";
import { proTools } from "@/lib/ai/tools";
import type { CalcResult } from "@/lib/ai/calc";
import { maybeSendBudgetAlert } from "@/lib/ai/alerts";
import { cacheKey, isFollowUp } from "@/lib/ai/cache";
import { todayLocal } from "@/lib/time";
import { sameOrigin } from "@/lib/security";

export const maxDuration = 60;
const HISTORY_DAYS = 7;

const xai = createXai({ apiKey: process.env.XAI_API_KEY });
const prices = parsePrices(process.env.XAI_PRICES);

const fail = (reason: string, status = 429) =>
  new Response(LIMIT_MESSAGES[reason] ?? "No se pudo procesar la solicitud.", { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/** Respuesta fija sin llamar al modelo (emergencias o bloqueos). */
function staticReply(text: string, headers?: Record<string, string>) {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = generateId();
      writer.write({ type: "start", messageId: generateId() });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream, headers });
}

export async function POST(req: Request) {
  // 0. Solo peticiones del propio sitio
  if (!sameOrigin(req)) return new Response("Origen no permitido", { status: 403 });

  // 1. Sesión válida (cookie verificada con Supabase Auth)
  const s = await getSession();
  if (!s) return new Response("No autorizado", { status: 401 });
  if (s.role === "paciente" && !s.patientId) return new Response("Sin expediente", { status: 403 });
  if (!s.clinicId) return new Response("Sin consultorio", { status: 403 });
  if (s.mfaPending) return new Response("Verificación pendiente", { status: 401 });

  // 2. Solo se acepta el texto del último mensaje; el historial lo arma el servidor.
  const body = z.object({ text: z.string(), patientId: z.uuid().optional() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return new Response("Solicitud inválida", { status: 400 });
  const text = sanitize(body.data.text);
  if (!text) return fail("empty", 400);

  const admin = createAdminClient();
  const { data: settings } = await admin.from("ai_settings").select("*").eq("clinic_id", s.clinicId).single();
  if (!settings) return fail("disabled", 503);
  if (!settings.enabled) return fail("disabled", 503);
  if (text.length > settings.max_input_chars) return fail("too_long", 413);

  const isPro = s.role === "nutriologo";
  // Copiloto de consulta: solo el nutriólogo puede abrir el hilo de un expediente (el paciente jamás envía patientId útil)
  const copilotId = isPro ? body.data.patientId ?? null : null;
  const model = isPro ? (process.env.XAI_MODEL_PRO ?? "grok-4.20-0309-non-reasoning") : (process.env.XAI_MODEL_PATIENT ?? "grok-4.20-0309-non-reasoning");
  const maxOutputTokens = isPro ? settings.pro_max_output_tokens : settings.max_output_tokens;

  // 3. Filtro de emergencias / TCA para pacientes: respuesta fija, sin costo
  if (!isPro) {
    const screen = screenInput(text);
    if (screen.block) {
      await admin.from("ai_messages").insert([
        { user_id: s.userId, role: "user", content: text, blocked_reason: screen.reason },
        // Se marca también la respuesta para que el par completo quede fuera del historial del modelo
        { user_id: s.userId, role: "assistant", content: screen.reply, blocked_reason: screen.reason },
      ]);
      return staticReply(screen.reply);
    }
  }

  // Sin llave no hay modelo (el filtro de emergencias de arriba sí responde)
  if (!process.env.XAI_API_KEY) return fail("disabled", 503);

  // 4. Historial reciente desde la base (no confiable desde el cliente): últimos N turnos de los últimos 7 días
  const supabase = isPro ? await createClient() : null;
  let copilotCtx = "", copilotWeight: number | undefined;
  if (copilotId) {
    // Se lee con la sesión del nutriólogo (RLS) y sin nombre ni datos de contacto
    const [pc, ev] = await Promise.all([patientCard(supabase!, copilotId, true), evolutionCard(supabase!, copilotId, true)]);
    if ("error" in pc) return new Response("Paciente no encontrado", { status: 404 });
    copilotWeight = parseFloat(pc.resultados.find((r) => r.etiqueta === "Peso")?.valor ?? "") || undefined;
    copilotCtx = JSON.stringify("error" in ev ? [pc] : [pc, ev]);
  }
  const baseHistory = admin.from("ai_messages").select("role, content, cards").eq("user_id", s.userId).is("blocked_reason", null);
  const [{ data: history }, system] = await Promise.all([
    (copilotId ? baseHistory.eq("patient_id", copilotId) : baseHistory.is("patient_id", null))
      .gte("created_at", new Date(Date.now() - HISTORY_DAYS * 864e5).toISOString())
      .order("created_at", { ascending: false }).limit(settings.history_turns * 2),
    isPro ? Promise.resolve(copilotId ? `${PRO_SYSTEM}\n\n${COPILOT_SYSTEM}\n\n<expediente_paciente>\n${copilotCtx}\n</expediente_paciente>` : PRO_SYSTEM) : patientContext(s.patientId!).then((ctx) => `${PATIENT_SYSTEM}\n\n${ctx}`),
  ]);
  const rows = (history ?? []).reverse();
  while (rows[0]?.role === "assistant") rows.shift(); // el historial debe empezar con una pregunta
  const past: ModelMessage[] = rows.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const promptChars = system.length + past.reduce((a, m) => a + String(m.content).length, 0) + text.length;

  // 5. Caché del día: misma pregunta independiente con el mismo contexto → respuesta guardada, sin costo.
  //    Las preguntas de seguimiento dependen de la conversación y siempre van al modelo.
  const day = todayLocal();
  // El nutriólogo usa herramientas que leen expedientes y catálogos vivos: sus respuestas no se guardan en caché.
  const cacheable = !isPro && !isFollowUp(text);
  const key = cacheKey({ day, model, system, question: text });
  const { data: cached } = cacheable
    ? await admin.from("ai_cache").select("id, answer, hits").eq("user_id", s.userId).eq("cache_key", key).maybeSingle()
    : { data: null };
  if (cached) {
    await Promise.all([
      admin.from("ai_messages").insert([
        { user_id: s.userId, role: "user", content: text },
        { user_id: s.userId, role: "assistant", content: cached.answer },
      ]),
      admin.from("ai_cache").update({ hits: cached.hits + 1 }).eq("id", cached.id),
    ]);
    return staticReply(cached.answer, { "x-vitalia-cache": "hit" });
  }

  // 6. Cuotas + presupuesto con reserva atómica del costo estimado
  const est = estimateCost(prices, model, promptChars, maxOutputTokens);
  const { data: reserve, error: rErr } = await admin.rpc("ai_reserve", { p_user: s.userId, p_role: s.role, p_model: model, p_est_cost: est });
  if (rErr) return new Response("Error al verificar límites", { status: 500 });
  if (!reserve?.ok) return fail(reserve?.reason ?? "budget", reserve?.reason === "disabled" ? 503 : 429);
  const usageId = reserve.usage_id as string;

  await admin.from("ai_messages").insert({ user_id: s.userId, role: "user", content: text, patient_id: copilotId });

  // 7. Llamada en streaming con tope de salida. El nutriólogo dispone de herramientas de cálculo (solo lectura).
  const cards: CalcResult[] = [];
  const tools = isPro ? proTools(supabase!, (c) => cards.push(c), [text, copilotCtx, ...rows.map((m) => `${m.role === "user" ? m.content : ""}\n${m.cards ? JSON.stringify(m.cards) : ""}`)].join("\n"), copilotId ? { id: copilotId, weightKg: copilotWeight } : undefined) : undefined;
  const result = streamText({
    model: xai(model),
    system,
    messages: [...past, { role: "user", content: `<mensaje_usuario>\n${text}\n</mensaje_usuario>` }],
    maxOutputTokens,
    temperature: isPro ? 0.2 : 0.5,
    ...(tools ? { tools, stopWhen: stepCountIs(copilotId ? 10 : 6) } : {}),
    abortSignal: req.signal,
    onEnd: async ({ totalUsage, steps, finishReason }) => {
      const answer = steps.map((st) => st.text).filter(Boolean).join("\n\n");
      if (process.env.NODE_ENV === "development") {
        // Diagnóstico local: qué herramientas se negaron y por qué
        for (const st of steps) for (const r of (st.toolResults ?? []) as unknown as { toolName: string; input: unknown; output: unknown }[]) {
          if (r.output && typeof r.output === "object" && "error" in r.output) console.warn("[asistente] herramienta rechazada:", r.toolName, JSON.stringify(r.input), (r.output as { error: string }).error);
        }
      }
      // Solo se guardan en caché respuestas completas (no cortadas por el tope de tokens)
      if (cacheable && answer && finishReason === "stop") {
        await admin.from("ai_cache").delete().eq("user_id", s.userId).lt("day", day);
        await admin.from("ai_cache").upsert({ user_id: s.userId, day, cache_key: key, answer }, { onConflict: "user_id,cache_key" });
      }
      const inT = totalUsage.inputTokens ?? Math.ceil(promptChars / 3);
      const outT = totalUsage.outputTokens ?? Math.ceil(answer.length / 3);
      await admin.from("ai_usage").update({
        status: "final", input_tokens: inT, output_tokens: outT, cost_usd: costUsd(prices, model, inT, outT),
      }).eq("id", usageId);
      if (answer || cards.length) await admin.from("ai_messages").insert({ user_id: s.userId, role: "assistant", content: answer || "(cálculo)", cards: cards.length ? cards : null, patient_id: copilotId });
      await maybeSendBudgetAlert(admin, s.clinicId!);
    },
    onError: async () => {
      // Se conserva el costo estimado como gasto (conservador) y se marca el error
      await admin.from("ai_usage").update({ status: "error" }).eq("id", usageId);
    },
  });

  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream, sendReasoning: false }) });
}
