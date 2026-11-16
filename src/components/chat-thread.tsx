"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Textarea, cn, fmtDateTime } from "./ui";

type Msg = { id: string; patient_id: string; sender_id: string; body: string; created_at: string };

/** Hilo de mensajes paciente–nutriólogo con actualizaciones en tiempo real (Supabase Realtime + RLS). */
export function ChatThread({ patientId, me, initial, send }: {
  patientId: string; me: string; initial: Msg[]; send: (body: string) => Promise<{ error?: string; message?: Msg }>;
}) {
  const add = (msg: Msg) => setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    // Realtime evalúa RLS con el JWT del usuario: hay que pasarlo antes de suscribirse, o se conecta como anónimo.
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`messages:${patientId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `patient_id=eq.${patientId}` },
          (payload) => add(payload.new as Msg))
        .subscribe();
    });
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [patientId]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setError(null);
    start(async () => {
      const res = await send(body);
      if (res.error) return setError(res.error);
      setText("");
      if (res.message) add(res.message);
    });
  };

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-border bg-surface">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && <p className="text-center text-sm text-muted">Aún no hay mensajes.</p>}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.sender_id === me ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", m.sender_id === me ? "bg-primary text-primary-fg" : "bg-surface-2")}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 text-[10px] opacity-70">{fmtDateTime(m.created_at)}</p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {error && <p className="px-4 text-sm text-danger">{error}</p>}
      <div className="flex gap-2 border-t border-border p-3">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} placeholder="Escribe un mensaje…" className="min-h-10"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
        <Button onClick={submit} disabled={pending || !text.trim()} aria-label="Enviar"><Send className="size-4" /></Button>
      </div>
    </div>
  );
}
