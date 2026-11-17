"use client";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, Send } from "lucide-react";
import { Alert, Button, cn, Textarea } from "./ui";
import { Markdown } from "./markdown";
import { CalcCard, isCalcResult } from "./calc-card";
import type { CalcResult } from "@/lib/ai/calc";

export function AssistantChat({ initial, maxChars, suggestions, disclaimer, patientId, className, quick }: {
  initial: { role: "user" | "assistant"; content: string; cards?: CalcResult[] | null }[]; maxChars: number; suggestions: string[]; disclaimer: string;
  /** Copiloto de consulta: el hilo pertenece al expediente de este paciente */
  patientId?: string; className?: string;
  /** Accesos fijos sobre el campo de texto (pasos de la consulta) */
  quick?: { label: string; text: string }[];
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Solo se envía el texto nuevo: el servidor reconstruye el historial
      prepareSendMessagesRequest: ({ messages }) => {
        const last = messages[messages.length - 1];
        const text = last?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
        return { body: patientId ? { text, patientId } : { text } };
      },
    }),
    messages: initial.map((m, i) => ({ id: `h${i}`, role: m.role, parts: [{ type: "text" as const, text: m.content }] })),
  });
  // Tarjetas de cálculo de conversaciones anteriores (guardadas con la respuesta)
  const savedCards = (id: string) => (id.startsWith("h") ? initial[Number(id.slice(1))]?.cards ?? [] : []);
  const busy = status === "submitted" || status === "streaming";
  const end = useRef<HTMLDivElement>(null);
  const lastLen = messages.at(-1)?.parts.reduce((a, p) => a + (p.type === "text" ? p.text.length : 0), 0) ?? 0;
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, lastLen]);
  const send = (t: string) => { const v = t.trim(); if (!v || busy) return; sendMessage({ text: v }); setInput(""); };

  return (
    <div className={cn("flex h-[75vh] flex-col rounded-xl border border-border bg-surface", className)}>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="py-6 text-center">
            <Bot className="mx-auto size-8 text-primary" />
            <p className="mt-2 text-sm text-muted">{disclaimer}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => <Button key={s} size="sm" variant="secondary" onClick={() => send(s)}>{s}</Button>)}
            </div>
          </div>
        )}
        {messages.map((m) => {
          if (m.role === "user") return (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-3 py-2 text-sm text-primary-fg">
                {m.parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null))}
              </div>
            </div>
          );
          // Respuesta: tarjetas de cálculo (resultado exacto de la herramienta) y texto del modelo, en orden
          return (
            <div key={m.id} className="flex max-w-[92%] flex-col gap-2 sm:max-w-[85%]">
              {savedCards(m.id).map((c, i) => <CalcCard key={`s${i}`} card={c} patientId={patientId} />)}
              {m.parts.map((p, i) => {
                if (p.type === "text") return p.text.trim() ? <div key={i} className="rounded-2xl bg-surface-2 px-3 py-2 text-sm"><Markdown text={p.text} /></div> : null;
                if (!(p.type as string).startsWith("tool-")) return null;
                const t = p as { state?: string; output?: unknown };
                if (t.state === "output-available") return isCalcResult(t.output) ? <CalcCard key={i} card={t.output} patientId={patientId} /> : null;
                if (t.state === "output-error") return <p key={i} className="text-xs text-warn">No se pudo completar un cálculo.</p>;
                return <p key={i} className="flex items-center gap-2 text-xs text-muted"><span className="size-2 animate-pulse rounded-full bg-primary" />Trabajando con las fórmulas y el expediente…</p>;
              })}
            </div>
          );
        })}
        {status === "submitted" && <p className="text-sm text-muted">Pensando…</p>}
        {error && <Alert tone="warn">{error.message || "No se pudo responder. Intenta más tarde."}</Alert>}
        <div ref={end} />
      </div>
      {quick && messages.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-border px-3 py-2">
          {quick.map((q) => <button key={q.label} type="button" disabled={busy} onClick={() => send(q.text)} className="whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-[background-color,color,border-color,transform] duration-200 hover:border-primary/40 hover:bg-primary-soft hover:text-primary active:scale-[0.97] disabled:opacity-50">{q.label}</button>)}
        </div>
      )}
      <p className="px-4 text-[11px] text-muted">{disclaimer}</p>
      <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={maxChars} placeholder="Escribe tu pregunta…" className="min-h-10"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <Button type="submit" disabled={busy || !input.trim()} aria-label="Enviar"><Send className="size-4" /></Button>
      </form>
    </div>
  );
}
