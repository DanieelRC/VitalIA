// Genera las plantillas de correo de Supabase Auth (supabase/templates) con el mismo diseño que los correos de la app.
// Uso: npm run email:templates   → después: npx supabase config push (con SMTP_PASSWORD exportada)
import { writeFileSync } from "node:fs";
import { renderEmail } from "../src/lib/email-layout.ts";

const link = (type) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=/invitacion`;

const templates = {
  "invite.html": renderEmail({
    preheader: "Activa tu cuenta para ver tu plan, tus recetas y tus citas.",
    title: "Tu nutriólogo te invitó a VitalIA",
    paragraphs: [
      "Hola. Tu nutriólogo creó tu expediente en VitalIA.",
      "Activa tu cuenta para ver tu plan de alimentación, recetas y rutinas, agendar tus citas, escribirle por mensajes y registrar tu progreso.",
    ],
    cta: { label: "Activar mi cuenta", url: link("invite") },
    note: "El enlace es de un solo uso y caduca en 1 hora. Si ya venció, pide a tu nutriólogo uno nuevo. Si no esperabas este correo, ignóralo.",
    footer: "Recibes este correo porque tu nutriólogo te registró como paciente en VitalIA.",
  }),
  "recovery.html": renderEmail({
    preheader: "Usa este enlace para crear una nueva contraseña.",
    title: "Crea una nueva contraseña",
    paragraphs: ["Recibimos una solicitud para crear una nueva contraseña para tu cuenta de VitalIA."],
    cta: { label: "Crear nueva contraseña", url: link("recovery") },
    note: "El enlace es de un solo uso y caduca en 1 hora. Si no lo solicitaste, ignora este correo: tu contraseña no cambiará.",
    footer: "Recibes este correo porque se pidió una nueva contraseña para esta cuenta.",
  }),
};

for (const [file, { html }] of Object.entries(templates)) {
  writeFileSync(new URL(`../supabase/templates/${file}`, import.meta.url), html + "\n");
  console.log(`supabase/templates/${file}`);
}
