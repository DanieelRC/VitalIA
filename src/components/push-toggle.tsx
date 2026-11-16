"use client";
import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { removeSubscription, saveSubscription } from "@/lib/actions/push";
import { Alert, Button } from "./ui";

const toKey = (b64: string) => {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

type State = "loading" | "unsupported" | "denied" | "off" | "on";

/** Activa o desactiva las notificaciones en este dispositivo. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => setState(sub ? "on" : "off")).catch(() => setState("unsupported"));
  }, [publicKey]);

  const enable = async () => {
    setBusy(true); setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
      const res = await saveSubscription(sub.toJSON());
      if (res.error) { await sub.unsubscribe(); setError(res.error); } else setState("on");
    } catch {
      setError("No se pudieron activar las notificaciones en este navegador.");
    } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) { await removeSubscription(sub.endpoint); await sub.unsubscribe(); }
      setState("off");
    } finally { setBusy(false); }
  };

  if (state === "loading") return <div className="skeleton h-10 w-56" />;
  if (state === "unsupported") return <Alert tone="warn">Este navegador no admite notificaciones. En iPhone, primero agrega VitalIA a tu pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí.</Alert>;
  if (state === "denied") return <Alert tone="warn">Bloqueaste las notificaciones de este sitio. Actívalas en los ajustes del navegador y vuelve a esta página.</Alert>;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {state === "on"
          ? <><span className="flex items-center gap-2 text-sm font-semibold text-primary"><BellRing className="size-4" /> Activadas en este dispositivo</span>
              <Button size="sm" variant="secondary" onClick={disable} disabled={busy}><BellOff className="size-4" /> Desactivar</Button></>
          : <Button onClick={enable} disabled={busy}><BellRing className="size-4" /> {busy ? "Activando…" : "Activar notificaciones"}</Button>}
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
