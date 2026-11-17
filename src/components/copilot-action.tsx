"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Send } from "lucide-react";
import type { CardAction } from "@/lib/ai/calc";
import { applyNoteDraft, applyPlanDraft } from "@/app/consultorio/pacientes/[id]/copiloto/actions";
import { sendMessage } from "@/lib/actions/messages";
import { Button, Textarea } from "./ui";

/**
 * Botón de una tarjeta de borrador del Copiloto. El asistente nunca guarda ni envía: aquí decide el nutriólogo.
 * Plan y nota se crean en estado «borrador» y se abren para revisarlos; el mensaje se puede editar antes de enviarlo.
 */
export function CopilotAction({ patientId, action }: { patientId: string; action: CardAction }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [text, setText] = useState(action.tipo === "mensaje" ? action.mensaje : "");

  const open = (run: () => Promise<{ href?: string; error?: string }>) => start(async () => {
    setError(null);
    const res = await run();
    if (res.href) router.push(res.href); else setError(res.error ?? "No se pudo completar.");
  });

  return (
    <div className="grid gap-2 border-t border-border pt-3">
      {action.tipo === "plan" && (
        <Button size="sm" disabled={pending} onClick={() => open(() => applyPlanDraft(patientId, action.plan))} className="justify-self-start">
          {pending ? "Creando borrador…" : <>Aplicar al plan<ArrowRight className="size-4" aria-hidden /></>}
        </Button>
      )}
      {action.tipo === "nota" && (
        <Button size="sm" disabled={pending} onClick={() => open(() => applyNoteDraft(patientId, action.nota))} className="justify-self-start">
          {pending ? "Creando nota…" : <>Crear nota en borrador<ArrowRight className="size-4" aria-hidden /></>}
        </Button>
      )}
      {action.tipo === "mensaje" && (sent ? (
        <p className="animate-enter flex items-center gap-1.5 text-sm font-medium text-primary"><Check className="size-4" aria-hidden />Enviado al paciente.</p>
      ) : (
        <>
          <Textarea aria-label="Mensaje para el paciente" value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={4000} />
          <Button size="sm" disabled={pending || !text.trim()} className="justify-self-start" onClick={() => start(async () => {
            setError(null);
            const res = await sendMessage(patientId, text);
            if ("error" in res && res.error) setError(res.error); else setSent(true);
          })}>
            <Send className="size-4" aria-hidden />{pending ? "Enviando…" : "Enviar al paciente"}
          </Button>
        </>
      ))}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
