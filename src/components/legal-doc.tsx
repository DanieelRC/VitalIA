import Link from "next/link";
import type { ReactNode } from "react";
import { PlateMark, Wordmark } from "@/components/plate";

/** Enlaces legales para pies de página. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Documentos legales" className={className}>
      <Link href="/privacidad" className="hover:text-text hover:underline">Aviso de privacidad</Link>
      <span aria-hidden> · </span>
      <Link href="/terminos" className="hover:text-text hover:underline">Términos y condiciones</Link>
    </nav>
  );
}

/** Marco de lectura para documentos legales: cómodo de leer, imprimible. */
export function LegalDoc({ title, subtitle, updated, draft, children }: { title: string; subtitle?: ReactNode; updated: string; draft?: boolean; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="no-print border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2"><PlateMark size={26} /><Wordmark /></Link>
          <LegalLinks className="hidden text-sm text-muted sm:block" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {draft && (
          <p className="no-print mb-6 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
            Borrador pendiente de revisión legal. Los datos entre corchetes deben completarse antes de usarse con personas reales.
          </p>
        )}
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
        <p className="mt-1 text-sm text-muted">Última actualización: {updated}</p>
        <article className="legal-prose mt-8">{children}</article>
      </main>
    </div>
  );
}
