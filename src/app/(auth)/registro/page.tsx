import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { PlateMark, Wordmark } from "@/components/plate";
import { Field, Input } from "@/components/ui";
import { LEGAL } from "@/lib/legal";
import { signUp } from "../actions";

export const metadata = { title: "Crear consultorio" };

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md animate-enter">
        <span className="mb-8 flex items-center gap-2.5 text-text"><PlateMark size={34} /><Wordmark className="text-2xl" /></span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Crea tu consultorio</h1>
        <p className="mt-1 mb-6 text-sm text-muted">14 días de prueba con el plan Inicio (hasta 5 pacientes activos). Sin tarjeta.</p>
        <ActionForm action={signUp} className="flex flex-col gap-4">
          <Field label="Tu nombre"><Input name="full_name" autoComplete="name" required minLength={3} /></Field>
          <Field label="Nombre del consultorio" hint="Aparece en los PDF y en el portal de tus pacientes."><Input name="clinic" autoComplete="organization" required minLength={2} /></Field>
          <Field label="Cédula profesional (opcional)" hint="Aparece en tu aviso de privacidad y en los PDF. Puedes agregarla después."><Input name="license" inputMode="numeric" maxLength={20} /></Field>
          <Field label="Correo"><Input name="email" type="email" autoComplete="email" required /></Field>
          <Field label="Contraseña" hint="Mínimo 8 caracteres."><Input name="password" type="password" autoComplete="new-password" required minLength={8} /></Field>
          <p className="rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
            {LEGAL.company}, con domicilio en {LEGAL.address}, usará tus datos de identificación, contacto y profesionales para crear tu cuenta,
            prestarte el servicio, administrar tu suscripción y darte soporte. Puedes ejercer tus derechos ARCO en {LEGAL.email}. Consulta el{" "}
            <Link href="/privacidad" target="_blank" className="underline">aviso de privacidad integral</Link>.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="terms" required className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>
              Acepto los <Link href="/terminos" target="_blank" className="font-semibold text-primary underline">términos y condiciones</Link>, incluido el contrato de encargo de datos, y el{" "}
              <Link href="/privacidad" target="_blank" className="font-semibold text-primary underline">aviso de privacidad</Link>. Como responsable de los datos de mis pacientes, recabaré su consentimiento.
            </span>
          </label>
          <SubmitButton pendingText="Creando…">Crear consultorio</SubmitButton>
        </ActionForm>
        <p className="mt-6 text-sm text-muted">¿Ya tienes cuenta? <Link href="/login" className="font-semibold text-primary hover:underline">Inicia sesión</Link></p>
      </div>
    </main>
  );
}
