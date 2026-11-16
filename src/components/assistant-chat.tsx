"use client";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, Send } from "lucide-react";
import { Alert, Button, Textarea, cn } from "./ui";
import { Markdown } from "./markdown";

export function AssistantChat({ initial, maxChars, suggestions, disclaimer }: {
  initial: { role: "user" | "assistant"; content: string }[]; maxChars: number; suggestions: string[]; disclaimer: string;
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Solo se envía el texto nuevo: el servidor reconstruye el historial
      prepareSendMessagesRequest: ({ messages }) => {
        const last = messages[messages.length - 1];
        const text = last?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
        return { body: { text } };
      },
    }),
    messages: initial.map((m, i) => ({ id: `h${i}`, role: m.role, parts: [{ type: "text" as const, text: m.content }] })),
  });
  const busy = status === "submitted" || status === "streaming";
  const end = useRef<HTMLDivElement>(null);
  const lastLen = messages.at(-1)?.parts.reduce((a, p) => a + (p.type === "text" ? p.text.length : 0), 0) ?? 0;
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, lastLen]);
  const send = (t: string) => { const v = t.trim(); if (!v || busy) return; sendMessage({ text: v }); setInput(""); };

  return (
    <div className="flex h-[75vh] flex-col rounded-xl border border-border bg-surface">
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
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.role === "user" ? "whitespace-pre-wrap bg-primary text-primary-fg" : "bg-surface-2")}>
              {m.role === "user"
                ? m.parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null))
                : <Markdown text={m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")} />}
            </div>
          </div>
        ))}
        {status === "submitted" && <p className="text-sm text-muted">Pensando…</p>}
        {error && <Alert tone="warn">{error.message || "No se pudo responder. Intenta más tarde."}</Alert>}
        <div ref={end} />
      </div>
      <p className="px-4 text-[11px] text-muted">{disclaimer}</p>
      <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={maxChars} placeholder="Escribe tu pregunta…" className="min-h-10"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <Button type="submit" disabled={busy || !input.trim()} aria-label="Enviar"><Send className="size-4" /></Button>
      </form>
    </div>
  );
}
