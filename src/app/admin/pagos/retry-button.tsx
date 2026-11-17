"use client";
import { useState, useTransition } from "react";
import { adminRetryCfdi } from "./actions";

export function RetryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={() => start(async () => setMsg(await adminRetryCfdi(id)))}
        className="text-xs font-semibold text-primary hover:underline disabled:opacity-50">{pending ? "Timbrando…" : "Reintentar CFDI"}</button>
      {msg.error && <span role="alert" className="max-w-56 text-right text-xs text-danger">{msg.error}</span>}
      {msg.ok && <span role="status" className="text-xs text-primary">{msg.ok}</span>}
    </span>
  );
}
