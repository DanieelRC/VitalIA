// Da (o quita) acceso al panel de administración de la plataforma a una cuenta existente.
// Uso: npm run make-admin -- correo@ejemplo.com           (dar acceso)
//      npm run make-admin -- correo@ejemplo.com --quitar  (retirar acceso)
// El panel exige verificación en dos pasos: actívala en Ajustes antes de entrar.
import { createClient } from "@supabase/supabase-js";

const [email, flag] = process.argv.slice(2);
if (!email) { console.error("Uso: npm run make-admin -- correo@ejemplo.com [--quitar]"); process.exit(1); }
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (data.users.length < 1000) break;
}
if (!user) { console.error(`No existe una cuenta con el correo ${email}. Regístrala primero.`); process.exit(1); }

if (flag === "--quitar") {
  const { error } = await admin.from("platform_admins").delete().eq("user_id", user.id);
  if (error) throw error;
  console.log(`Acceso de administrador retirado a ${email}.`);
} else {
  const { error } = await admin.from("platform_admins").upsert({ user_id: user.id });
  if (error) throw error;
  const factors = user.factors?.filter((f) => f.status === "verified") ?? [];
  console.log(`${email} ahora es administrador. Entra en /admin.`);
  if (!factors.length) console.log("⚠ Esta cuenta aún no tiene verificación en dos pasos: el panel la pedirá antes de abrir.");
}
