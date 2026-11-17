import "server-only";
import Stripe from "stripe";
import { priceKey } from "./map";

/** Mientras no se decida cobrar de verdad, las llaves live quedan bloqueadas. */
const liveBlocked = (key: string) => /_live_/.test(key) && process.env.BILLING_ALLOW_LIVE !== "1";

export const billingConfigured = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  return !!key && !liveBlocked(key);
};
export const billingTestMode = () => !/_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Los pagos en línea no están configurados (STRIPE_SECRET_KEY).");
  if (liveBlocked(key)) throw new Error("La llave live de Stripe está bloqueada. Define BILLING_ALLOW_LIVE=1 solo cuando decidas cobrar.");
  return (client ??= new Stripe(key));
}

/** Price mensual del plan en MXN (IVA incluido). Lo crea la primera vez; si cambia el precio, crea uno nuevo. */
export async function priceFor(plan: { code: string; name: string; price_mxn: number }) {
  const { cents, lookupKey } = priceKey(plan.code, plan.price_mxn);
  const s = stripe();
  const found = await s.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const price = await s.prices.create({
    currency: "mxn", unit_amount: cents, recurring: { interval: "month" }, tax_behavior: "inclusive",
    lookup_key: lookupKey, metadata: { plan_code: plan.code },
    product_data: { name: `VitalIA · Plan ${plan.name}`, metadata: { plan_code: plan.code } },
  });
  return price.id;
}

/** Portal de Stripe solo para tarjeta y recibos: cancelar y cambiar de plan se hace dentro de VitalIA. */
export async function portalConfiguration() {
  const s = stripe();
  const list = await s.billingPortal.configurations.list({ active: true, limit: 20 });
  const mine = list.data.find((c) => c.metadata?.app === "vitalia");
  if (mine) return mine.id;
  const created = await s.billingPortal.configurations.create({
    business_profile: { headline: "VitalIA · Método de pago y recibos" },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: false },
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
    },
    metadata: { app: "vitalia" },
  });
  return created.id;
}
