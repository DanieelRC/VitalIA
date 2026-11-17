"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { setCancel } from "./actions";

/** Cancelación inmediata y sin trabas: un clic más la confirmación. */
export function CancelButton({ cancelled, endsLabel }: { cancelled: boolean; endsLabel: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (cancel: boolean) => start(async () => {
    if (cancel && !window.confirm(`¿Cancelar tu suscripción? Conservas el acceso hasta ${endsLabel} y no se te cobrará de nuevo.`)) return;
    const r = await setCancel(cancel);
    setError(r.error ?? null);
  });
  return (
    <div className="flex flex-col items-start gap-1.5">
      {cancelled
        ? <Button size="sm" onClick={() => run(false)} disabled={pending}>{pending ? "Reanudando…" : "Reanudar suscripción"}</Button>
        : <Button size="sm" variant="secondary" onClick={() => run(true)} disabled={pending}>{pending ? "Cancelando…" : "Cancelar suscripción"}</Button>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
