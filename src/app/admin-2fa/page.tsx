import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MfaSettings } from "@/components/mfa-settings";
import { Alert, PageHeader } from "@/components/ui";
import { isPlatformAdmin } from "@/lib/admin";
import { getSession } from "@/lib/supabase/server";

export const metadata = { title: "Verificación del administrador" };

/** El panel de administración ve a todos los clientes: exige verificación en dos pasos. */
export default async function AdminMfa() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.mfaPending) redirect("/login/verificar");
  if (!(await isPlatformAdmin(s.userId))) notFound();
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10">
      <PageHeader title="Activa la verificación en dos pasos" subtitle="Requerida para el panel de administración" />
      <Alert tone="warn">El panel muestra datos de todos los consultorios y permite cambiar sus planes. Para protegerlo, actívala con una app de autenticación.</Alert>
      <MfaSettings />
      <Link href="/admin" className="text-sm font-semibold text-primary hover:underline">Ya la activé · Ir al panel</Link>
    </main>
  );
}
