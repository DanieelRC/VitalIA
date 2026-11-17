"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "../../actions";

export function MfaChallenge() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const verify = () => start(async () => {
    setError(null);
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp?.find((f) => f.status === "verified");
    if (!factor) return setError("No encontramos tu método de verificación. Vuelve a iniciar sesión.");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (error) return setError("Código incorrecto o caducado. Revisa la hora de tu teléfono e intenta de nuevo.");
    router.replace("/");
    router.refresh();
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); verify(); }}>
      <Field label="Código">
        <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
          autoFocus required pattern="\d{6}" placeholder="123456" className="text-center font-mono text-xl tracking-[0.4em]" />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" disabled={pending || code.length !== 6}>{pending ? "Verificando…" : "Verificar"}</Button>
      <button type="button" onClick={() => signOut()} className="text-sm text-muted hover:text-text">Usar otra cuenta</button>
    </form>
  );
}
