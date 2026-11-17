import { NextResponse } from "next/server";
import Stripe from "stripe";
import { handleStripeEvent } from "@/lib/billing/sync";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Webhook de Stripe: verifica la firma, ignora eventos repetidos y sincroniza suscripciones y pagos. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("Webhook no configurado", { status: 503 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new NextResponse("Firma inválida", { status: 400 });
  }

  const admin = createAdminClient();
  const { error: seen } = await admin.from("billing_events").insert({ id: event.id, type: event.type });
  if (seen) return seen.code === "23505" ? NextResponse.json({ duplicate: true }) : new NextResponse("Error", { status: 500 });
  try {
    await handleStripeEvent(event);
  } catch (e) {
    // Se libera el evento para que el reintento de Stripe lo procese
    await admin.from("billing_events").delete().eq("id", event.id);
    console.error("stripe webhook", event.type, e);
    return new NextResponse("Error", { status: 500 });
  }
  return NextResponse.json({ received: true });
}
