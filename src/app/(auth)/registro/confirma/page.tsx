import Link from "next/link";
import { MailCheck } from "lucide-react";
import { PlateMark, Wordmark } from "@/components/plate";

export const metadata = { title: "Confirma tu correo" };

export default async function ConfirmEmail({ searchParams }: { searchParams: Promise<{ correo?: string }> }) {
  const { correo } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md animate-enter text-center">
        <span className="mb-8 inline-flex items-center gap-2.5 text-text"><PlateMark size={34} /><Wordmark className="text-2xl" /></span>
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-soft text-primary"><MailCheck className="size-7" /></span>
        <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight">Revisa tu correo</h1>
        <p className="mt-2 text-muted">
          Te enviamos un enlace para confirmar {correo ? <strong className="text-text">{correo.slice(0, 120)}</strong> : "tu correo"}. Ábrelo para activar tu consultorio.
          El enlace caduca en 1 hora.
        </p>
        <p className="mt-6 text-sm text-muted">¿No llegó? Revisa tu carpeta de spam o <Link href="/login" className="font-semibold text-primary hover:underline">inicia sesión</Link> para recibir uno nuevo.</p>
      </div>
    </main>
  );
}
