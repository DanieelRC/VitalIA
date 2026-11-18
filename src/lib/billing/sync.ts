import "server-only";
import type Stripe from "stripe";
import { sendEmail } from "@/lib/email";
import { escapeHtml, renderEmail } from "@/lib/email-layout";
import { createAdminClient } from "@/lib/supabase/server";
import { issueCfdi } from "./cfdi";
import { mapSubscription, satPaymentForm } from "./map";
import { billingConfigured, stripe } from "./stripe";

const UUID = /^[0-9a-f-]{36}$/i;
const customerId = (c: string | { id: string } | null) => (c == null ? null : typeof c === "string" ? c : c.id);

async function clinicFor(metadataClinic: string | null | undefined, customer: string | null) {
  const admin = createAdminClient();
  if (metadataClinic && UUID.test(metadataClinic)) {
    const { data } = await admin.from("clinics").select("id, stripe_subscription_id").eq("id", metadataClinic).maybeSingle();
    if (data) return data;
  }
  if (!customer) return null;
  const { data } = await admin.from("clinics").select("id, stripe_subscription_id").eq("stripe_customer_id", customer).maybeSingle();
  return data;
}

/** Aplica al consultorio el estado de una suscripción de Stripe. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const clinic = await clinicFor(sub.metadata?.clinic_id, customerId(sub.customer));
  if (!clinic) return false;
  // Eventos tardíos de una suscripción anterior no deben pisar la vigente
  if (clinic.stripe_subscription_id && clinic.stripe_subscription_id !== sub.id) return false;
  const { error } = await createAdminClient().from("clinics").update(mapSubscription(sub)).eq("id", clinic.id);
  if (error) throw new Error(error.message);
  return true;
}

async function paymentForm(invoiceId: string) {
  try {
    const full = await stripe().invoices.retrieve(invoiceId, { expand: ["payments.data.payment.payment_intent.latest_charge"] });
    const pi = full.payments?.data[0]?.payment.payment_intent;
    const charge = pi && typeof pi === "object" ? pi.latest_charge : null;
    return satPaymentForm(charge && typeof charge === "object" ? charge.payment_method_details?.card?.funding : null);
  } catch {
    return "04";
  }
}

/** Registra un pago recibido y timbra su CFDI. */
export async function recordInvoice(inv: Stripe.Invoice) {
  if (!inv.id || inv.amount_paid <= 0 || inv.currency !== "mxn") return;
  const details = inv.parent?.subscription_details;
  const clinic = await clinicFor(details?.metadata?.clinic_id, customerId(inv.customer));
  if (!clinic) return;
  const admin = createAdminClient();
  const line = inv.lines?.data[0];
  const { data: row, error } = await admin.from("billing_invoices").upsert({
    clinic_id: clinic.id,
    stripe_invoice_id: inv.id,
    amount_mxn: inv.amount_paid / 100,
    description: (line?.description ?? "Suscripción mensual a VitalIA").slice(0, 1000),
    period_start: line?.period ? new Date(line.period.start * 1000).toISOString() : null,
    period_end: line?.period ? new Date(line.period.end * 1000).toISOString() : null,
    paid_at: new Date((inv.status_transitions?.paid_at ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    payment_form: billingConfigured() ? await paymentForm(inv.id) : "04",
    receipt_url: inv.hosted_invoice_url ?? null,
  }, { onConflict: "stripe_invoice_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  await admin.from("clinics").update({ payment_failed_at: null }).eq("id", clinic.id);
  if (row) await issueCfdi(row.id);
}

async function paymentFailed(inv: Stripe.Invoice) {
  const clinic = await clinicFor(inv.parent?.subscription_details?.metadata?.clinic_id, customerId(inv.customer));
  if (!clinic) return;
  const admin = createAdminClient();
  await admin.from("clinics").update({ payment_failed_at: new Date().toISOString() }).eq("id", clinic.id);
  const { data: cs } = await admin.from("clinic_settings").select("email, name").eq("clinic_id", clinic.id).maybeSingle();
  if (!cs?.email) return;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  await sendEmail(cs.email, "No pudimos cobrar tu suscripción de VitalIA", renderEmail({
    preheader: "Revisa tu método de pago para no perder el acceso.",
    badge: { label: "Pago rechazado", tone: "danger" },
    title: "No pudimos cobrar tu suscripción",
    paragraphs: [
      `No pudimos procesar el pago de la suscripción de <strong>${escapeHtml(cs.name ?? "tu consultorio")}</strong>.`,
      "Volveremos a intentarlo en los próximos días. Para evitar que se suspenda el acceso, revisa o cambia tu tarjeta.",
    ],
    cta: { label: "Revisar mi método de pago", url: `${site}/consultorio/suscripcion` },
    footer: "Recibes este correo como titular de la suscripción de tu consultorio en VitalIA.",
  }));
}

/** Al volver de Checkout: confirma la suscripción y el primer pago sin esperar al webhook. */
export async function confirmCheckoutSession(sessionId: string, clinicId: string) {
  if (!billingConfigured() || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return false;
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription", "subscription.latest_invoice"] });
    const sub = session.subscription;
    if (session.client_reference_id !== clinicId || !sub || typeof sub !== "object") return false;
    const customer = customerId(session.customer);
    if (customer) await createAdminClient().from("clinics").update({ stripe_customer_id: customer }).eq("id", clinicId).is("stripe_customer_id", null);
    await syncSubscription(sub);
    const inv = sub.latest_invoice;
    if (inv && typeof inv === "object" && inv.status === "paid") await recordInvoice(inv);
    return true;
  } catch (e) {
    console.error("confirmCheckoutSession", e);
    return false;
  }
}

/** Procesa un evento verificado de Stripe. */
export async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.mode !== "subscription" || !s.client_reference_id || !UUID.test(s.client_reference_id)) return;
      const customer = customerId(s.customer);
      if (customer) await createAdminClient().from("clinics").update({ stripe_customer_id: customer }).eq("id", s.client_reference_id).is("stripe_customer_id", null);
      const subId = customerId(s.subscription);
      if (subId && billingConfigured()) await syncSubscription(await stripe().subscriptions.retrieve(subId));
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const payload = event.data.object;
      // Los eventos pueden llegar desordenados: se aplica el estado actual, no el del evento
      const sub = billingConfigured() && event.type !== "customer.subscription.deleted" ? await stripe().subscriptions.retrieve(payload.id) : payload;
      await syncSubscription(sub);
      return;
    }
    case "invoice.paid":
      return recordInvoice(event.data.object);
    case "invoice.payment_failed":
      return paymentFailed(event.data.object);
  }
}
