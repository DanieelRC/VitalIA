import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Datos legales de VitalIA. ⚠ BORRADOR: completar y hacer revisar por un abogado antes de tener usuarios reales.
 * Al cambiar el contenido de un documento, sube su versión: se guarda con cada aceptación como evidencia.
 */
export const LEGAL = {
  draft: true,
  company: process.env.LEGAL_COMPANY ?? "[Razón social de VitalIA, pendiente]",
  address: process.env.LEGAL_ADDRESS ?? "[Domicilio fiscal, pendiente]",
  email: process.env.LEGAL_EMAIL ?? "[correo de privacidad, pendiente]",
  updated: "17 de noviembre de 2026",
  versions: { aviso_vitalia: "2026-11-17.2", terminos: "2026-11-17.2", aviso_paciente: "2026-11-17" },
  /** Proveedores que tratan datos por cuenta de VitalIA (subencargados) */
  processors: [
    { name: "Supabase Inc.", role: "Base de datos, autenticación y almacenamiento de archivos", country: "Estados Unidos" },
    { name: "Vercel Inc.", role: "Alojamiento y ejecución de la aplicación", country: "Estados Unidos" },
    { name: "Resend (Plus Five Five, Inc.)", role: "Envío de correos (invitaciones, recordatorios)", country: "Estados Unidos" },
    { name: "xAI Corp.", role: "Modelo de inteligencia artificial del asistente y del copiloto", country: "Estados Unidos" },
    { name: "Stripe, Inc.", role: "Procesamiento de pagos con tarjeta de la suscripción", country: "Estados Unidos" },
    { name: "Facturapi", role: "Emisión y timbrado de facturas electrónicas (CFDI)", country: "México" },
  ],
  /** Años de conservación del expediente clínico (NOM-004-SSA3-2012, 5.4) */
  retentionYears: 5,
} as const;

export type LegalDocument = keyof typeof LEGAL.versions;

/** Deja evidencia de que alguien aceptó un documento (fecha, versión, IP y navegador). Solo desde el servidor. */
export async function recordAcceptance(a: { userId: string; document: LegalDocument; patientId?: string | null; clinicId?: string | null; tutorName?: string | null }) {
  const h = await headers();
  const { error } = await createAdminClient().from("legal_acceptances").insert({
    user_id: a.userId, document: a.document, version: LEGAL.versions[a.document],
    patient_id: a.patientId ?? null, clinic_id: a.clinicId ?? null, tutor_name: a.tutorName ?? null,
    ip: (h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "").slice(0, 80) || null,
    user_agent: (h.get("user-agent") ?? "").slice(0, 400) || null,
  });
  if (error) throw new Error("No se pudo registrar la aceptación: " + error.message);
}

/** Edad cumplida a hoy a partir de una fecha "YYYY-MM-DD". */
export function ageFrom(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const b = new Date(birth + "T00:00:00Z"), n = new Date();
  let age = n.getUTCFullYear() - b.getUTCFullYear();
  if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export const ARCO_LABEL: Record<string, string> = {
  acceso: "Acceso", rectificacion: "Rectificación", cancelacion: "Cancelación", oposicion: "Oposición", revocacion: "Revocación del consentimiento",
};
export const ARCO_STATUS: Record<string, { label: string; tone: "info" | "warn" | "primary" | "neutral" }> = {
  recibida: { label: "Recibida", tone: "info" }, en_proceso: { label: "En proceso", tone: "warn" },
  procedente: { label: "Atendida", tone: "primary" }, improcedente: { label: "No procedente", tone: "neutral" },
};
