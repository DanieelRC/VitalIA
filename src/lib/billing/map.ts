import type Stripe from "stripe";

type ClinicStatus = "activa" | "vencida" | "cancelada";
export type ClinicBillingUpdate = {
  stripe_subscription_id: string | null;
  stripe_customer_id: string;
  status?: ClinicStatus;
  plan?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
};

const PLAN_CODES = new Set(["p5", "p10", "p20", "pmax"]);
const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

/**
 * Traduce una suscripción de Stripe al estado del consultorio.
 * - active, trialing y past_due conservan el acceso (past_due: Stripe sigue reintentando el cobro).
 * - canceled: «cancelada» si la pidió el titular, «vencida» si fue por falta de pago.
 * - unpaid, incomplete_expired y paused: «vencida». incomplete: aún no hay pago, no cambia el estado.
 */
export function mapSubscription(sub: Stripe.Subscription): ClinicBillingUpdate {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const item = sub.items.data[0];
  const code = item?.price.metadata?.plan_code ?? sub.metadata?.plan_code;
  const periodEnd = sub.status === "trialing" ? sub.trial_end : Math.max(0, ...sub.items.data.map((i) => i.current_period_end));
  const base: ClinicBillingUpdate = { stripe_subscription_id: sub.id, stripe_customer_id: customer };
  if (code && PLAN_CODES.has(code)) base.plan = code;

  switch (sub.status) {
    case "active":
    case "trialing":
    case "past_due":
      return { ...base, status: "activa", current_period_end: iso(periodEnd), cancel_at_period_end: sub.cancel_at_period_end || !!sub.cancel_at };
    case "canceled": {
      const byOwner = sub.cancellation_details?.reason !== "payment_failed";
      return { ...base, stripe_subscription_id: null, status: byOwner ? "cancelada" : "vencida", current_period_end: iso(sub.ended_at), cancel_at_period_end: false };
    }
    case "unpaid":
    case "incomplete_expired":
    case "paused":
      return { ...base, status: "vencida", cancel_at_period_end: false };
    default:
      return base;
  }
}

/** Forma de pago del CFDI según la tarjeta (catálogo c_FormaPago del SAT). */
export const satPaymentForm = (funding: string | null | undefined) => (funding === "debit" ? "28" : "04");

/** Precio en centavos y lookup key estable: si cambia el precio, se crea otro Price en Stripe. */
export function priceKey(code: string, priceMxn: number) {
  const cents = Math.round(priceMxn * 100);
  return { cents, lookupKey: `vitalia_${code}_${cents}_mxn_mensual` };
}

export const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/** Regímenes fiscales del SAT (c_RegimenFiscal) más comunes para quien contrata VitalIA. */
export const TAX_REGIMES: Record<string, string> = {
  "601": "General de Ley Personas Morales",
  "603": "Personas Morales con Fines no Lucrativos",
  "605": "Sueldos y Salarios e Ingresos Asimilados a Salarios",
  "606": "Arrendamiento",
  "612": "Personas Físicas con Actividades Empresariales y Profesionales",
  "616": "Sin obligaciones fiscales",
  "621": "Incorporación Fiscal",
  "625": "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  "626": "Régimen Simplificado de Confianza",
};

export const CFDI_USES: Record<string, string> = {
  G03: "G03 · Gastos en general",
  S01: "S01 · Sin efectos fiscales",
};

export const CFDI_STATUS: Record<string, { label: string; tone: "primary" | "info" | "warn" | "danger" | "neutral" }> = {
  timbrada: { label: "Factura emitida", tone: "primary" },
  pendiente: { label: "En proceso", tone: "info" },
  sin_datos: { label: "Faltan datos fiscales", tone: "warn" },
  error: { label: "Error al facturar", tone: "danger" },
  no_configurado: { label: "Facturación no configurada", tone: "neutral" },
};
