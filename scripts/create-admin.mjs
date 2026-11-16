// Crea (o promueve) la cuenta del nutriólogo.
// Uso: node --env-file=.env.local scripts/create-admin.mjs correo@dominio.com "Nombre Apellido" [contraseña]
// Sin contraseña se envía una invitación por correo.
import { createClient } from "@supabase/supabase-js";

const [email, fullName = "Nutriólogo", password] = process.argv.slice(2);
if (!email) {
  console.error("Uso: node --env-file=.env.local scripts/create-admin.mjs correo \"Nombre\" [contraseña]");
  process.exit(1);
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let userId;
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (existing) {
  userId = existing.id;
} else if (password) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) throw error;
  userId = data.user.id;
} else {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo: `${site}/invitacion` });
  if (error) throw error;
  userId = data.user.id;
}

const { error } = await admin.from("profiles").upsert({ id: userId, role: "nutriologo", full_name: fullName });
if (error) throw error;
await admin.from("clinic_settings").update({ nutritionist_name: fullName, email }).eq("id", 1).is("nutritionist_name", null);
console.log(`Listo: ${email} es nutriólogo (id ${userId}).`);
