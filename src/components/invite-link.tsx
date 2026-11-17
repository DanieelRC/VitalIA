"use client";
import { useState, useTransition } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { createInviteLink } from "@/app/consultorio/pacientes/actions";
import { Alert, Button } from "./ui";

/** Genera y copia el enlace de invitación de un paciente. Es de un solo uso: quien lo abra puede crear la contraseña. */
export function InviteLink({ patientId }: { patientId: string }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = () => start(async () => {
    setError(null); setCopied(false);
    const res = await createInviteLink(patientId);
    if (res.link) setLink(res.link); else setError(res.error ?? "No se pudo generar el enlace.");
  });
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* el campo es seleccionable */ }
  };

  return (
    <div className="mt-3 grid gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={generate} disabled={pending}><Link2 className="size-4" />{pending ? "Generando…" : "Generar enlace para compartir"}</Button>
      {error && <Alert tone="danger">{error}</Alert>}
      {link && (
        <div className="grid gap-2">
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de invitación" className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-xs" />
            <Button type="button" size="sm" onClick={copy}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copiado" : "Copiar"}</Button>
          </div>
          <p className="text-xs text-muted">Envíalo solo al paciente (WhatsApp, por ejemplo). Es de un solo uso, caduca en 1 hora y permite crear la contraseña de su cuenta.</p>
        </div>
      )}
    </div>
  );
}
