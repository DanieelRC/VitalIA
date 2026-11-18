import Link from "next/link";
import { SubmitButton } from "@/components/form";
import { PlateMark, Wordmark } from "@/components/plate";
import { Alert } from "@/components/ui";
import { confirmLink } from "./actions";

export const metadata = { title: "Continuar", robots: { index: false } };

const COPY: Record<string, { title: string; text: string; button: string }> = {
  invite: { title: "Activa tu cuenta", text: "Tu nutriólogo te invitó a VitalIA. Continúa para crear tu contraseña y entrar a tu portal.", button: "Continuar y crear mi contraseña" },
  recovery: { title: "Crea tu nueva contraseña", text: "Continúa para elegir una contraseña nueva para tu cuenta.", button: "Continuar" },
  magiclink: { title: "Confirma tu correo", text: "Continúa para confirmar tu correo y activar tu consultorio.", button: "Confirmar mi correo" },
  email: { title: "Confirma tu correo", text: "Continúa para confirmar tu correo.", button: "Confirmar mi correo" },
};

/**
 * Destino de los enlaces de los correos. No canjea el token al abrirse: lo hace el botón (POST), para que las vistas
 * previas automáticas de enlaces (Mail de iPhone, WhatsApp, antivirus) no lo gasten antes que la persona.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token_hash, type = "", next = "/" } = await searchParams;
  const copy = COPY[type];

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm animate-enter rounded-3xl border border-border bg-surface p-8 shadow-soft">
        <span className="mb-8 flex items-center gap-2.5 text-text"><PlateMark size={30} /><Wordmark className="text-xl" /></span>
        {token_hash && copy ? (
          <form action={confirmLink} className="flex flex-col gap-5">
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">{copy.title}</h1>
              <p className="mt-2 text-sm text-muted">{copy.text}</p>
            </div>
            <input type="hidden" name="token_hash" value={token_hash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={next} />
            <SubmitButton pendingText="Verificando…">{copy.button}</SubmitButton>
            <p className="text-xs text-muted">El enlace es de un solo uso. Si no esperabas este correo, cierra esta página.</p>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <Alert tone="warn">Este enlace está incompleto. Ábrelo directamente desde el correo o pide uno nuevo.</Alert>
            <Link href="/login" className="text-sm font-semibold text-primary hover:underline">Ir a iniciar sesión</Link>
          </div>
        )}
      </div>
    </main>
  );
}
