import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminSupabase } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Llamado desde un Server Component: el middleware refresca la sesión.
          }
        },
      },
    },
  );
}

/** Cliente con service role: ignora RLS. Usar solo en servidor y con validación previa. */
export function createAdminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type Role = "nutriologo" | "paciente";
export type Session = {
  userId: string;
  email: string;
  role: Role;
  fullName: string | null;
  patientId: string | null;
};

/** Usuario autenticado con su rol (validado contra Supabase Auth, no solo la cookie). */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return null;
  let patientId: string | null = null;
  if (profile.role === "paciente") {
    const { data: p } = await supabase.from("my_patient").select("id").single();
    patientId = p?.id ?? null;
  }
  return {
    userId: user.id,
    email: user.email ?? "",
    role: profile.role,
    fullName: profile.full_name,
    patientId,
  };
});

export async function requireRole(role: Role): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== role) redirect(s.role === "nutriologo" ? "/consultorio" : "/portal");
  if (role === "paciente" && !s.patientId) redirect("/login?error=sin-expediente");
  return s;
}
