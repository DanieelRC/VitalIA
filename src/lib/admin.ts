import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createAdminClient, createClient, getSession } from "@/lib/supabase/server";

/** ¿El usuario es administrador de la plataforma? (tabla sin políticas: solo la lee el service role) */
export const isPlatformAdmin = cache(async (userId: string) => {
  const { data } = await createAdminClient().from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
});

/**
 * Exige un administrador con sesión verificada en dos pasos. A quien no es admin se le responde 404,
 * para no revelar que el panel existe. Llamar en cada página y en cada server action del panel.
 */
export async function requireAdmin() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.mfaPending) redirect("/login/verificar");
  if (!(await isPlatformAdmin(s.userId))) notFound();
  const { data: aal } = await (await createClient()).auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect("/admin-2fa");
  return s;
}

/** Deja constancia de una acción del admin (bitácora inmutable). */
export async function logAdminAction(a: { adminId: string; clinicId?: string | null; action: string; reason: string; before?: unknown; after?: unknown }) {
  const { error } = await createAdminClient().from("admin_actions").insert({
    admin_id: a.adminId, clinic_id: a.clinicId ?? null, action: a.action, reason: a.reason,
    before: a.before ?? null, after: a.after ?? null,
  });
  if (error) throw new Error(`No se pudo registrar en la bitácora: ${error.message}`);
}

/** CSV compatible con Excel (BOM, separador coma, comillas escapadas, sin fórmulas inyectables). */
export function toCsv(head: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export const ADMIN_ACTIONS: Record<string, string> = {
  trial: "Prueba gratis",
  comp: "Cortesía",
  comp_remove: "Cortesía retirada",
  plan: "Cambio de plan",
  suspend: "Suspensión",
  reactivate: "Reactivación",
  ai_budget: "Tope de IA",
  resend_confirmation: "Reenvío de confirmación",
  plan_edit: "Edición de plan",
  settings: "Ajustes de plataforma",
  cfdi_retry: "Reintento de CFDI",
};

export type AdminClinic = {
  id: string; name: string; plan: string; plan_name: string; price_mxn: number | null; ai_budget_usd: number; ai_budget_override_usd: number | null;
  status: "prueba" | "activa" | "vencida" | "cancelada"; trial_ends_at: string | null; current_period_end: string | null;
  cancel_at_period_end: boolean; comp_until: string | null; in_comp: boolean; paying: boolean; stripe_customer_id: string | null;
  payment_failed_at: string | null; created_at: string; owner_id: string | null; owner_email: string | null; owner_name: string | null;
  last_sign_in_at: string | null; email_confirmed_at: string | null; active_patients: number; total_patients: number; staff_count: number;
  ai_cost_month: number; revenue_total: number; has_fiscal: boolean; arco_overdue: number;
};

/** Estado legible para el admin: distingue prueba vencida, cortesía y pago. */
export function clinicLabel(c: Pick<AdminClinic, "status" | "trial_ends_at" | "in_comp" | "paying" | "cancel_at_period_end">) {
  if (c.status === "prueba") return c.trial_ends_at && Date.parse(c.trial_ends_at) > Date.now() ? { label: "Prueba", tone: "info" as const } : { label: "Prueba vencida", tone: "danger" as const };
  if (c.status === "activa") {
    if (c.in_comp) return { label: "Cortesía", tone: "info" as const };
    if (c.paying) return { label: c.cancel_at_period_end ? "Pagando · cancela" : "Pagando", tone: "primary" as const };
    return { label: "Activa sin cobro", tone: "warn" as const };
  }
  return c.status === "vencida" ? { label: "Vencida", tone: "danger" as const } : { label: "Cancelada", tone: "neutral" as const };
}
