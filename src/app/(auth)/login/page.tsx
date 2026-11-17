import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { Plate, PlateMark, Wordmark } from "@/components/plate";
import { Alert, Field, Input } from "@/components/ui";
import { LegalLinks } from "@/components/legal-doc";
import { requestReset, signIn } from "../actions";

export const metadata = { title: "Iniciar sesión" };

const HERO = [
  { family: "verduras" as const, value: 3 }, { family: "frutas" as const, value: 2 }, { family: "cereales" as const, value: 3 },
  { family: "leguminosas" as const, value: 1.5 }, { family: "aoa" as const, value: 2 }, { family: "leche" as const, value: 1 }, { family: "grasas" as const, value: 1 },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-field p-12 text-field-fg lg:flex lg:flex-col lg:justify-between">
        <span className="flex items-center gap-2.5"><PlateMark size={34} /><Wordmark className="text-2xl" /></span>
        <div>
          <h2 className="max-w-md font-display text-5xl font-extrabold leading-[1.05] tracking-tight">Tu plan, plato por plato.</h2>
          <p className="mt-4 max-w-sm text-field-muted">Consulta nutricional con seguimiento entre citas: tu plan, tus avances y tu nutriólogo en un solo lugar.</p>
        </div>
        <Plate segments={HERO} size={520} className="pointer-events-none absolute -right-40 -bottom-44 opacity-95" label="Plato del bien comer" />
        <p className="relative text-xs text-field-muted">El acceso es por invitación de tu nutriólogo.</p>
      </aside>

      <main className="grid place-items-center px-4 py-10">
        <div className="w-full max-w-sm animate-enter">
          <div className="mb-8 lg:hidden">
            <span className="flex items-center gap-2.5 text-text"><PlateMark size={34} /><Wordmark className="text-2xl" /></span>
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Qué gusto verte</h1>
          <p className="mt-1 mb-6 text-sm text-muted">Entra con el correo al que llegó tu invitación.</p>
          {error === "sin-expediente" && <div className="mb-4"><Alert tone="warn">Tu cuenta no tiene expediente asociado. Escríbele a tu nutriólogo para que te lo active.</Alert></div>}
          {error === "sin-consultorio" && <div className="mb-4"><Alert tone="warn">Tu cuenta no pertenece a ningún consultorio. <Link href="/registro" className="font-semibold underline">Crea uno</Link> o pide acceso a quien lo administra.</Alert></div>}
          {error === "enlace" && <div className="mb-4"><Alert tone="warn">El enlace no es válido o ya expiró. Pide uno nuevo abajo.</Alert></div>}
          <ActionForm action={signIn} className="flex flex-col gap-4">
            <Field label="Correo"><Input name="email" type="email" autoComplete="email" required /></Field>
            <Field label="Contraseña"><Input name="password" type="password" autoComplete="current-password" required /></Field>
            <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
          </ActionForm>
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer text-muted transition-colors hover:text-text">¿Olvidaste tu contraseña?</summary>
            <ActionForm action={requestReset} className="mt-3 flex flex-col gap-2">
              <Input name="email" type="email" placeholder="tu@correo.com" aria-label="Correo para restablecer la contraseña" required />
              <SubmitButton variant="secondary" pendingText="Enviando…">Enviar enlace</SubmitButton>
            </ActionForm>
          </details>
          <p className="mt-8 text-xs text-muted lg:hidden">El acceso es por invitación de tu nutriólogo.</p>
          <p className="mt-6 text-sm text-muted">¿Eres nutriólogo? <Link href="/registro" className="font-semibold text-primary hover:underline">Crea tu consultorio</Link></p>
          <LegalLinks className="mt-6 text-xs text-muted" />
        </div>
      </main>
    </div>
  );
}
