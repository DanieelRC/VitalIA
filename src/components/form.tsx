"use client";
import { useActionState, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button } from "./ui";

export type FormState = { error?: string; ok?: string } | null;

export function SubmitButton({ children, variant, size, pendingText = "Guardando…", ...rest }: {
  children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; pendingText?: string;
  name?: string; value?: string; formAction?: (fd: FormData) => void;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} {...rest}>
      {pending ? pendingText : children}
    </Button>
  );
}

/** Formulario ligado a una server action que devuelve {error|ok}. */
export function ActionForm({ action, children, className, resetOnOk }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: ReactNode; className?: string; resetOnOk?: boolean;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res?.ok && resetOnOk) ref.current?.reset();
    return res;
  }, null);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && <div className="mt-3"><Alert tone="danger">{state.error}</Alert></div>}
      {state?.ok && <div className="mt-3"><Alert tone="primary">{state.ok}</Alert></div>}
    </form>
  );
}

export function ConfirmButton({ children, message, variant = "ghost", size = "sm" }: {
  children: ReactNode; message: string; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md";
}) {
  return (
    <Button type="submit" variant={variant} size={size} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </Button>
  );
}
