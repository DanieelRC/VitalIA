// Crea (o promueve) la cuenta del nutriólogo.
// Uso: node --env-file=.env.local scripts/create-admin.mjs correo@dominio.com "Nombre Apellido" [contraseña]
// Sin contraseña se envía una invitación por correo.
// Opcional por entorno: CLINIC_NAME, PLAN (p5|p10|p20|pmax), CLINIC_STATUS (prueba|activa).
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
  // Sin contraseña: se crea la cuenta y se imprime un enlace de un solo uso para que la persona defina la suya
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) throw error;
  userId = data.user.id;
}
if (!password) {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${site}/invitacion` } });
  if (error) throw error;
  console.log(`Enlace para crear la contraseña (un solo uso, caduca en 1 hora):\n${site}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery&next=%2Finvitacion`);
}

// Cada nutriólogo titular tiene su consultorio. Si ya pertenece a uno, se respeta.
const { data: prof } = await admin.from("profiles").select("clinic_id").eq("id", userId).maybeSingle();
if (prof?.clinic_id) {
  const { error } = await admin.from("profiles").update({ role: "nutriologo", full_name: fullName }).eq("id", userId);
  if (error) throw error;
  console.log(`Listo: ${email} ya pertenecía al consultorio ${prof.clinic_id}.`);
} else {
  const plan = process.env.PLAN ?? "p5";
  const { data: clinicId, error } = await admin.rpc("create_clinic", {
    p_owner: userId, p_name: process.env.CLINIC_NAME ?? "Consultorio de Nutrición", p_owner_name: fullName,
    p_plan: plan, p_trial_days: 14, p_status: process.env.CLINIC_STATUS ?? "prueba",
  });
  if (error) throw error;
  console.log(`Listo: ${email} es nutriólogo (id ${userId}) del consultorio ${clinicId}, plan ${plan}.`);
}
