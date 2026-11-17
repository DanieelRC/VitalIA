import { redirect } from "next/navigation";
import { PlateMark, Wordmark } from "@/components/plate";
import { createClient } from "@/lib/supabase/server";
import { MfaChallenge } from "./mfa-challenge";

export const metadata = { title: "Verificación en dos pasos" };

export default async function VerifyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2" || aal?.nextLevel !== "aal2") redirect("/");
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm animate-enter">
        <span className="mb-8 flex items-center gap-2.5 text-text"><PlateMark size={34} /><Wordmark className="text-2xl" /></span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Verificación en dos pasos</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Escribe el código de 6 dígitos de tu app de autenticación.</p>
        <MfaChallenge />
      </div>
    </main>
  );
}
