"use client";
import { useEffect, useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Enroll = { id: string; qr: string; secret: string };

/** Activar o desactivar la verificación en dos pasos con una app de autenticación (TOTP). */
export function MfaSettings() {
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();

  const load = async () => {
    const { data } = await createClient().auth.mfa.listFactors();
    setFactorId(data?.totp?.find((f) => f.status === "verified")?.id ?? null);
  };
  useEffect(() => { load(); }, []);

  const begin = () => start(async () => {
    setMsg({});
    const supabase = createClient();
    // Limpia intentos previos sin terminar
    const { data } = await supabase.auth.mfa.listFactors();
    for (const f of data?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data: e, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `VitalIA ${new Date().toISOString().slice(0, 10)}` });
    if (error || !e) return setMsg({ error: "No se pudo iniciar la activación. Intenta de nuevo." });
    setEnroll({ id: e.id, qr: e.totp.qr_code, secret: e.totp.secret });
  });

  const confirm = () => start(async () => {
    if (!enroll) return;
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    if (error) return setMsg({ error: "Código incorrecto. Revisa que la hora de tu teléfono sea correcta." });
    setEnroll(null); setCode("");
    setMsg({ ok: "Listo. A partir de ahora te pediremos un código al iniciar sesión." });
    await load();
  });

  const disable = () => start(async () => {
    if (!factorId || !confirmDisable()) return;
    const { error } = await createClient().auth.mfa.unenroll({ factorId });
    if (error) return setMsg({ error: "No se pudo desactivar. Cierra sesión, entra de nuevo con tu código y vuelve a intentarlo." });
    setMsg({ ok: "Verificación en dos pasos desactivada." });
    await load();
  });

  return (
    <Card title="Verificación en dos pasos">
      <p className="text-sm text-muted">Protege los expedientes de tus pacientes: además de tu contraseña, se pedirá un código de una app como Google Authenticator, Microsoft Authenticator o 1Password.</p>
      {factorId === undefined ? <p className="mt-3 text-sm text-muted">Cargando…</p> : factorId ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="size-4" /> Activada</p>
          <Button variant="secondary" size="sm" onClick={disable} disabled={pending}>Desactivar</Button>
        </div>
      ) : enroll ? (
        <form className="mt-3 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); confirm(); }}>
          <p className="text-sm">1. Escanea este código con tu app de autenticación.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="Código QR para tu app de autenticación" width={180} height={180} className="rounded-xl bg-white p-2" />
          <p className="text-xs text-muted">¿No puedes escanearlo? Escribe esta clave: <code className="break-all font-mono">{enroll.secret}</code></p>
          <Field label="2. Escribe el código de 6 dígitos que muestra la app">
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required className="font-mono tracking-[0.3em]" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending || code.length !== 6}>{pending ? "Verificando…" : "Activar"}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEnroll(null)}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <Button className="mt-3" size="sm" onClick={begin} disabled={pending}>Activar verificación en dos pasos</Button>
      )}
      {msg.error && <div className="mt-3"><Alert tone="danger">{msg.error}</Alert></div>}
      {msg.ok && <div className="mt-3"><Alert tone="primary">{msg.ok}</Alert></div>}
    </Card>
  );
}

function confirmDisable() {
  return window.confirm("¿Desactivar la verificación en dos pasos? Tu cuenta quedará protegida solo con tu contraseña.");
}
