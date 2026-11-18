// Vistas previas de todos los correos (datos ficticios) para revisión visual. Uso: node AUDIT/qa/scripts/email_previews.mjs
import { writeFileSync, copyFileSync } from "node:fs";
import { renderEmail } from "../../../src/lib/email-layout.ts";
const site = "https://vitalia-virid.vercel.app";
const out = (n) => new URL(`../emails/${n}`, import.meta.url);
const mails = {
  "1-confirmacion": { preheader: "Un paso más: confirma tu correo para empezar a usar tu consultorio.", title: "Confirma tu correo",
    paragraphs: ["Hola. Tu consultorio en VitalIA está casi listo. Confirma que este correo es tuyo para activarlo y empezar tu periodo de prueba."],
    cta: { label: "Confirmar mi correo", url: `${site}/auth/confirm?token_hash=abc123&type=magiclink&next=%2Fconsultorio%3Fbienvenida%3D1` },
    note: "El enlace caduca en 1 hora. Si no creaste una cuenta en VitalIA, ignora este mensaje.", footer: "Recibes este correo porque se registró un consultorio con esta dirección." },
  "2-recordatorio-cita": { preheader: "Te esperamos el jueves 20 de noviembre de 2026, 10:00.", badge: { label: "Recordatorio", tone: "info" }, title: "Tu cita es pronto",
    paragraphs: ["Hola Ana, te recordamos tu próxima consulta de nutrición."],
    details: [["Fecha y hora", "jueves, 20 de noviembre de 2026, 10:00"], ["Consultorio", "Nutrición Integral Daniela"], ["Dirección", "Av. Reforma 123, Col. Centro, CDMX"], ["Teléfono", "55 1234 5678"]],
    cta: { label: "Ver mis citas", url: `${site}/portal/citas` }, note: "Si no puedes asistir, cancélala desde tu portal para liberar el horario.",
    footer: "Recibes este correo porque tienes una cita confirmada con tu nutriólogo en VitalIA." },
  "3-renovacion": { preheader: "Se renovará automáticamente el 23 de noviembre de 2026.", badge: { label: "Aviso de renovación", tone: "info" }, title: "Tu suscripción se renueva pronto",
    paragraphs: ["La suscripción de <strong>Nutrición Integral Daniela</strong> se renovará automáticamente.", "Si no quieres renovarla, puedes cancelarla en cualquier momento y sin penalización. Seguirás teniendo acceso hasta el final del periodo pagado."],
    details: [["Plan", "Crecimiento"], ["Fecha de renovación", "23 de noviembre de 2026"], ["Importe", "$499 MXN (IVA incluido)"]],
    cta: { label: "Administrar mi suscripción", url: `${site}/consultorio/suscripcion` }, footer: "Te avisamos al menos 5 días antes de cada cobro automático, como lo pide la Ley Federal de Protección al Consumidor." },
  "4-presupuesto-ia": { preheader: "Llevas $8.12 USD de $10.00 este mes.", badge: { label: "Presupuesto de IA", tone: "warn" }, title: "Tu asistente de IA llegó al 80 % del presupuesto",
    paragraphs: ["Al llegar al 100 %, el asistente se pausa para tus pacientes; tú conservas una reserva para seguir usándolo en consulta. Puedes ajustar el presupuesto cuando quieras."],
    details: [["Gasto del mes", "$8.12 USD"], ["Presupuesto", "$10.00 USD"]], cta: { label: "Ir a Ajustes e IA", url: `${site}/consultorio/ajustes` },
    footer: "Recibes este aviso una vez al mes como responsable del consultorio." },
  "5-crisis": { preheader: "Un paciente escribió a Vita algo que podría ser una urgencia.", badge: { label: "Urgente", tone: "danger" }, title: "Un paciente podría necesitar atención",
    paragraphs: ["<strong>Ana Prueba</strong> escribió al asistente Vita un mensaje que podría indicar una urgencia (síntoma de alarma o ideas de hacerse daño).", "Vita le respondió con el 911 y la Línea de la Vida (800 911 2000). Te sugerimos contactarlo lo antes posible."],
    cta: { label: "Abrir sus mensajes", url: `${site}/consultorio/mensajes/00000000-0000-0000-0000-000000000000` },
    note: "Por privacidad, este correo no incluye el contenido del mensaje. Recibirás como máximo un aviso por paciente cada 12 horas.", footer: "Recibes este aviso porque eres el consultorio de este paciente en VitalIA." },
  "6-pago-rechazado": { preheader: "Revisa tu método de pago para no perder el acceso.", badge: { label: "Pago rechazado", tone: "danger" }, title: "No pudimos cobrar tu suscripción",
    paragraphs: ["No pudimos procesar el pago de la suscripción de <strong>Nutrición Integral Daniela</strong>.", "Volveremos a intentarlo en los próximos días. Para evitar que se suspenda el acceso, revisa o cambia tu tarjeta."],
    cta: { label: "Revisar mi método de pago", url: `${site}/consultorio/suscripcion` }, footer: "Recibes este correo como titular de la suscripción de tu consultorio en VitalIA." },
};
for (const [n, m] of Object.entries(mails)) { const r = renderEmail(m); writeFileSync(out(`${n}.html`), r.html); writeFileSync(out(`${n}.txt`), r.text); }
copyFileSync(new URL("../../../supabase/templates/invite.html", import.meta.url), out("7-supabase-invitacion.html"));
copyFileSync(new URL("../../../supabase/templates/recovery.html", import.meta.url), out("8-supabase-recuperacion.html"));
console.log("ok");
