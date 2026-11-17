import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { mapSubscription, priceKey, RFC_RE, satPaymentForm } from "./map";

const sub = (over: Record<string, unknown> = {}) => ({
  id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, cancel_at: null, trial_end: null, ended_at: null,
  cancellation_details: null, metadata: { clinic_id: "c" },
  items: { data: [{ current_period_end: 1_800_000_000, price: { metadata: { plan_code: "p10" } } }] },
  ...over,
}) as unknown as Stripe.Subscription;

describe("mapSubscription", () => {
  it("activa con plan y fin de periodo", () => {
    expect(mapSubscription(sub())).toEqual({
      stripe_subscription_id: "sub_1", stripe_customer_id: "cus_1", plan: "p10", status: "activa",
      current_period_end: new Date(1_800_000_000_000).toISOString(), cancel_at_period_end: false,
    });
  });
  it("en prueba usa trial_end y conserva el acceso; past_due también", () => {
    expect(mapSubscription(sub({ status: "trialing", trial_end: 1_700_000_000 })).current_period_end).toBe(new Date(1_700_000_000_000).toISOString());
    expect(mapSubscription(sub({ status: "past_due" })).status).toBe("activa");
  });
  it("cancelada por el titular vs. por falta de pago", () => {
    const own = mapSubscription(sub({ status: "canceled", cancellation_details: { reason: "cancellation_requested" } }));
    expect(own).toMatchObject({ status: "cancelada", stripe_subscription_id: null });
    expect(mapSubscription(sub({ status: "canceled", cancellation_details: { reason: "payment_failed" } })).status).toBe("vencida");
  });
  it("unpaid vence; incomplete no cambia el estado; plan desconocido se ignora", () => {
    expect(mapSubscription(sub({ status: "unpaid" })).status).toBe("vencida");
    expect(mapSubscription(sub({ status: "incomplete" })).status).toBeUndefined();
    const odd = sub();
    (odd.items.data[0].price as unknown as { metadata: object }).metadata = { plan_code: "hack" };
    expect(mapSubscription(odd).plan).toBeUndefined();
  });
  it("cancelación programada se refleja", () => {
    expect(mapSubscription(sub({ cancel_at_period_end: true })).cancel_at_period_end).toBe(true);
  });
});

describe("utilidades de cobro", () => {
  it("forma de pago SAT", () => {
    expect(satPaymentForm("debit")).toBe("28");
    expect(satPaymentForm("credit")).toBe("04");
    expect(satPaymentForm(null)).toBe("04");
  });
  it("lookup key cambia con el precio", () => {
    expect(priceKey("p5", 299)).toEqual({ cents: 29900, lookupKey: "vitalia_p5_29900_mxn_mensual" });
    expect(priceKey("p5", 349.5).cents).toBe(34950);
  });
  it("RFC de persona física y moral", () => {
    expect(RFC_RE.test("GODE561231GR8")).toBe(true);
    expect(RFC_RE.test("ABC010101AB1")).toBe(true);
    expect(RFC_RE.test("ABC0101AB1")).toBe(false);
  });
});
