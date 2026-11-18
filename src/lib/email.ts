import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

/**
 * Envío de correos de la app (confirmación de registro, recordatorios, avisos).
 * - SMTP (p. ej. una cuenta de Gmail dedicada con contraseña de aplicación) si están SMTP_USER y SMTP_PASSWORD.
 * - Si no, Resend con RESEND_API_KEY.
 * - Sin ninguno, no se envía nada ({ skipped: true }).
 * Los errores del proveedor se registran en el servidor (sin destinatario ni contenido) para poder diagnosticarlos.
 */
let smtp: Transporter | null = null;

function smtpTransport() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return null;
  const port = Number(process.env.SMTP_PORT ?? 465);
  smtp ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  return smtp;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<{ skipped: true } | { error?: string }> {
  const transport = smtpTransport();
  if (transport) {
    // Gmail solo envía desde la propia cuenta (o un alias verificado): por omisión, «VitalIA <cuenta>»
    const from = process.env.EMAIL_FROM || `VitalIA <${process.env.SMTP_USER}>`;
    try {
      await transport.sendMail({ from, to, subject, html });
      return {};
    } catch (e) {
      const err = e as { code?: string; responseCode?: number; message?: string };
      console.error("[email] El servidor SMTP rechazó el envío:", err.code ?? "", err.responseCode ?? "", (err.message ?? "").slice(0, 200));
      return { error: err.message ?? "Error SMTP" };
    }
  }

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return { skipped: true };
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: process.env.EMAIL_FROM, to, subject, html });
  if (error) console.error("[email] Resend rechazó el envío:", error.name, error.message.slice(0, 200));
  return { error: error?.message };
}
