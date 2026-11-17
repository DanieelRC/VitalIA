import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Plan = { code: string; name: string; max_patients: number | null; price_mxn: number | null; ai_budget_usd: number; sort: number; active: boolean };
export type Subscription = {
  clinicId: string; clinicName: string; isOwner: boolean; plan: Plan; plans: Plan[];
  status: "prueba" | "activa" | "vencida" | "cancelada";
  /** Vigente: en prueba sin vencer, o activa dentro de su periodo */
  active: boolean; endsAt: string | null; daysLeft: number | null; activePatients: number;
  /** El titular pidió cancelar: el acceso sigue hasta endsAt */
  cancelAtPeriodEnd: boolean;
  /** Suscripción pagada en Stripe vigente */
  stripeSubscribed: boolean;
  hasStripeCustomer: boolean;
  /** Último cobro rechazado (Stripe reintenta) */
  paymentFailedAt: string | null;
  /** Cortesía otorgada por VitalIA: activa sin cobro hasta esta fecha */
  compUntil: string | null;
};

/** Mensaje para el nutriólogo cuando la base rechaza un paciente por el plan (trigger enforce_patient_limit). */
export function planError(message: string): string | null {
  const lim = message.match(/PLAN_LIMITE:(\d+)/)?.[1];
  if (lim) return `Tu plan incluye ${lim} pacientes activos. Marca a alguno como inactivo o cambia de plan en Suscripción.`;
  if (message.includes("PLAN_INACTIVO")) return "Tu suscripción no está vigente. Revísala en Suscripción para agregar pacientes.";
  return null;
}

/** Plan, vigencia y uso del consultorio del nutriólogo en sesión. */
export const getSubscription = cache(async (): Promise<Subscription | null> => {
  const supabase = await createClient();
  const [{ data: { user } }, { data: clinic }, { data: plans }, { count }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("clinics").select("id, name, owner_id, plan, status, trial_ends_at, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_customer_id, payment_failed_at, comp_until, ai_budget_override_usd").maybeSingle(),
    supabase.from("plans").select("code, name, max_patients, price_mxn, ai_budget_usd, sort, active").order("sort"),
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("active", true),
  ]);
  if (!clinic || !plans?.length) return null;
  const list = plans.map((p) => ({ ...p, price_mxn: p.price_mxn == null ? null : Number(p.price_mxn), ai_budget_usd: Number(p.ai_budget_usd) })) as Plan[];
  const endsAt = (clinic.status === "prueba" ? clinic.trial_ends_at : clinic.current_period_end) as string | null;
  const left = endsAt ? Math.ceil((Date.parse(endsAt) - Date.now()) / 864e5) : null;
  const active = clinic.status === "activa" ? left == null || left > 0 : clinic.status === "prueba" && (left ?? 0) > 0;
  return {
    clinicId: clinic.id, clinicName: clinic.name, isOwner: clinic.owner_id === user?.id,
    // El tope de IA puede venir ajustado por VitalIA para este consultorio
    plan: (() => { const p = list.find((x) => x.code === clinic.plan) ?? list[0]; return clinic.ai_budget_override_usd == null ? p : { ...p, ai_budget_usd: Number(clinic.ai_budget_override_usd) }; })(),
    plans: list.filter((p) => p.active || p.code === clinic.plan),
    status: clinic.status, active, endsAt, daysLeft: left, activePatients: count ?? 0,
    cancelAtPeriodEnd: !!clinic.cancel_at_period_end,
    stripeSubscribed: !!clinic.stripe_subscription_id, hasStripeCustomer: !!clinic.stripe_customer_id,
    paymentFailedAt: clinic.payment_failed_at ?? null,
    compUntil: clinic.comp_until && Date.parse(clinic.comp_until) > Date.now() && !clinic.stripe_subscription_id ? clinic.comp_until : null,
  };
});
