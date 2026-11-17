// Prueba local del webhook de Stripe y de la seguridad de las tablas de cobro, sin llaves de Stripe.
// Firma eventos con STRIPE_WEBHOOK_SECRET y los envía al servidor de desarrollo (npm run dev).
// Uso: node --env-file=.env.local scripts/test-billing.mjs
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SITE = process.env.TEST_SITE ?? "http://localhost:3000";
const secret = process.env.STRIPE_WEBHOOK_SECRET;
if (!secret) throw new Error("Falta STRIPE_WEBHOOK_SECRET");
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let fails = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : " " + extra}`); if (!ok) fails++; };

const stamp = Date.now();
const users = [];
async function mkUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Prueba-Billing-123", email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  return data.user.id;
}
async function login(email) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "Prueba-Billing-123" });
  if (error) throw error;
  return c;
}

const ownerMail = `billing-owner-${stamp}@example.test`, otherMail = `billing-other-${stamp}@example.test`;
const owner = await mkUser(ownerMail);
const other = await mkUser(otherMail);
const { data: clinicId, error: ce } = await admin.rpc("create_clinic", { p_owner: owner, p_name: "Billing Test", p_owner_name: "Dueña" });
if (ce) throw ce;
const { data: otherClinic } = await admin.rpc("create_clinic", { p_owner: other, p_name: "Otro Billing", p_owner_name: "Otro" });

async function send(event, sig = true) {
  const payload = JSON.stringify(event);
  const header = sig ? Stripe.webhooks.generateTestHeaderString({ payload, secret }) : "t=1,v1=bad";
  const res = await fetch(`${SITE}/api/webhooks/stripe`, { method: "POST", body: payload, headers: { "stripe-signature": header, "content-type": "application/json" } });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const now = Math.floor(Date.now() / 1000);
const subObj = (status, extra = {}) => ({
  id: `sub_test_${stamp}`, object: "subscription", customer: `cus_test_${stamp}`, status, cancel_at_period_end: false, cancel_at: null,
  trial_end: null, ended_at: status === "canceled" ? now : null, cancellation_details: null,
  metadata: { clinic_id: clinicId, plan_code: "p20" },
  items: { data: [{ id: "si_1", current_period_end: now + 30 * 86400, price: { id: "price_1", metadata: { plan_code: "p20" } } }] },
  ...extra,
});
const ev = (type, object) => ({ id: `evt_${type}_${Math.random().toString(36).slice(2)}`, object: "event", type, data: { object } });
const clinic = async () => (await admin.from("clinics").select("*").eq("id", clinicId).single()).data;

try {
  // Firma
  check("firma inválida → 400", (await send(ev("customer.subscription.created", subObj("active")), false)).status === 400);

  // Alta
  const created = ev("customer.subscription.created", subObj("active"));
  const r1 = await send(created);
  let c = await clinic();
  check("suscripción activa sincroniza el consultorio", r1.status === 200 && c.status === "activa" && c.plan === "p20" && c.stripe_subscription_id === `sub_test_${stamp}` && c.stripe_customer_id === `cus_test_${stamp}`, JSON.stringify({ r1, status: c.status, plan: c.plan }));
  check("evento repetido se ignora", (await send(created)).body?.duplicate === true);

  // Evento de otra suscripción no pisa la vigente
  await send(ev("customer.subscription.updated", subObj("canceled", { id: "sub_vieja" })));
  check("evento de suscripción ajena no cambia el estado", (await clinic()).status === "activa");

  // Pago
  const invoice = {
    id: `in_test_${stamp}`, object: "invoice", customer: `cus_test_${stamp}`, currency: "mxn", amount_paid: 79900, status: "paid",
    hosted_invoice_url: "https://invoice.stripe.com/test", status_transitions: { paid_at: now },
    parent: { type: "subscription_details", subscription_details: { subscription: `sub_test_${stamp}`, metadata: { clinic_id: clinicId } } },
    lines: { data: [{ description: "1 × VitalIA · Plan Profesional (at $799.00 / month)", period: { start: now, end: now + 30 * 86400 } }] },
  };
  await admin.from("clinics").update({ payment_failed_at: new Date().toISOString() }).eq("id", clinicId);
  const r2 = await send(ev("invoice.paid", invoice));
  const { data: invs } = await admin.from("billing_invoices").select("*").eq("clinic_id", clinicId);
  check("pago registrado una vez, CFDI sin configurar", r2.status === 200 && invs.length === 1 && Number(invs[0].amount_mxn) === 799 && invs[0].cfdi_status === "no_configurado", JSON.stringify({ r2, invs }));
  check("pago exitoso limpia el aviso de cobro fallido", (await clinic()).payment_failed_at === null);
  await send(ev("invoice.paid", invoice));
  check("mismo pago con otro evento no se duplica", (await admin.from("billing_invoices").select("id").eq("clinic_id", clinicId)).data.length === 1);

  // Cobro fallido
  await send(ev("invoice.payment_failed", { ...invoice, id: `in_fail_${stamp}`, amount_paid: 0, status: "open" }));
  check("cobro fallido marca el consultorio", !!(await clinic()).payment_failed_at);

  // Cancelación programada y baja por falta de pago
  await send(ev("customer.subscription.updated", subObj("active", { cancel_at_period_end: true })));
  check("cancelación programada", (await clinic()).cancel_at_period_end === true);
  await send(ev("customer.subscription.deleted", subObj("canceled", { cancellation_details: { reason: "payment_failed" } })));
  c = await clinic();
  check("baja por falta de pago → vencida y libera la suscripción", c.status === "vencida" && c.stripe_subscription_id === null, JSON.stringify({ status: c.status }));

  // RLS
  const oc = await login(ownerMail), xc = await login(otherMail);
  const fiscal = { clinic_id: clinicId, rfc: "GODE561231GR8", legal_name: "EVA GOMEZ DIAZ", tax_regime: "612", zip: "06600" };
  check("titular guarda sus datos fiscales", !(await oc.from("billing_profiles").upsert(fiscal)).error);
  check("RFC inválido se rechaza", !!(await oc.from("billing_profiles").upsert({ ...fiscal, rfc: "XXX" })).error);
  check("titular ve sus pagos", (await oc.from("billing_invoices").select("id")).data?.length === 1);
  const ins = await oc.from("billing_invoices").insert({ clinic_id: clinicId, stripe_invoice_id: "in_fake", amount_mxn: 1, description: "x" });
  check("titular no puede crear pagos", !!ins.error);
  const upd = await oc.from("billing_invoices").update({ cfdi_status: "timbrada", cfdi_id: "otro" }).eq("clinic_id", clinicId).select();
  check("titular no puede alterar pagos", !upd.data?.length);
  const updClinic = await oc.from("clinics").update({ status: "activa", stripe_subscription_id: null }).eq("id", clinicId).select();
  check("titular no puede activarse sin pagar", !updClinic.data?.length);
  check("otro consultorio no ve pagos ajenos", (await xc.from("billing_invoices").select("id")).data?.length === 0);
  check("otro consultorio no ve datos fiscales ajenos", (await xc.from("billing_profiles").select("rfc")).data?.length === 0);
  check("otro consultorio no escribe datos fiscales ajenos", !!(await xc.from("billing_profiles").upsert({ ...fiscal, rfc: "ABC010101AB1" })).error);
  check("eventos de Stripe invisibles", (await oc.from("billing_events").select("id")).data?.length === 0);

  // Personal no titular del consultorio
  const staffMail = `billing-staff-${stamp}@example.test`;
  const staff = await mkUser(staffMail);
  await admin.from("profiles").upsert({ id: staff, role: "nutriologo", full_name: "Staff", clinic_id: clinicId });
  const sc = await login(staffMail);
  check("personal no titular no ve pagos ni datos fiscales", (await sc.from("billing_invoices").select("id")).data?.length === 0 && (await sc.from("billing_profiles").select("rfc")).data?.length === 0);

  // Prueba: choose_plan bloqueado con suscripción de Stripe
  await admin.from("clinics").update({ status: "prueba", trial_ends_at: new Date(Date.now() + 5 * 864e5).toISOString(), stripe_subscription_id: "sub_x" }).eq("id", clinicId);
  const { data: cp } = await oc.rpc("choose_plan", { p_code: "p5" });
  check("con suscripción pagada no se cambia el plan gratis", cp?.ok === false && cp.reason === "billing");

  // Cron: la suscripción de Stripe tiene 7 días de gracia
  await admin.from("clinics").update({ status: "activa", current_period_end: new Date(Date.now() - 2 * 864e5).toISOString() }).eq("id", clinicId);
  await admin.rpc("close_clinic_periods");
  check("cron respeta la gracia de Stripe", (await clinic()).status === "activa");
  await admin.from("clinics").update({ current_period_end: new Date(Date.now() - 8 * 864e5).toISOString() }).eq("id", clinicId);
  await admin.rpc("close_clinic_periods");
  check("cron vence tras la gracia", (await clinic()).status === "vencida");
} finally {
  await admin.from("clinics").delete().in("id", [clinicId, otherClinic]);
  for (const u of users) await admin.auth.admin.deleteUser(u);
}
console.log(fails ? `\n${fails} fallas` : "\nTodo bien");
process.exit(fails ? 1 : 0);
