// Pruebas del panel de administración: aislamiento en la base, acceso por HTTP (404 / 2FA) y cortesías.
// Requiere Supabase local y el servidor de desarrollo (npm run dev).
// Uso: node --env-file=.env.local scripts/test-admin.mjs
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SITE = process.env.TEST_SITE ?? "http://localhost:3000";
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PASS = "Prueba-Admin-123";

let fails = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : " " + extra}`); if (!ok) fails++; };

// TOTP (RFC 6238) para completar la verificación en dos pasos en la prueba
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "")) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

// Cookie de sesión con el formato de @supabase/ssr (base64url, en trozos de 3180)
function cookieFor(session) {
  const host = new URL(URL_).hostname.split(".")[0];
  const name = `sb-${host}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  if (value.length <= 3180) return `${name}=${value}`;
  const parts = value.match(/.{1,3180}/g);
  return parts.map((p, i) => `${name}.${i}=${p}`).join("; ");
}

const stamp = Date.now();
const users = [];
async function mkUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  return data.user.id;
}
async function login(email) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw error;
  return { c, session: data.session };
}
const get = (path, session) => fetch(`${SITE}${path}`, { redirect: "manual", headers: session ? { cookie: cookieFor(session) } : {} });

const nutriMail = `admin-nutri-${stamp}@example.test`, bossMail = `admin-boss-${stamp}@example.test`;
const nutri = await mkUser(nutriMail);
const boss = await mkUser(bossMail);
const { data: clinicId } = await admin.rpc("create_clinic", { p_owner: nutri, p_name: "Admin Test Clinic", p_owner_name: "Nutri" });
const { data: bossClinic } = await admin.rpc("create_clinic", { p_owner: boss, p_name: "Consultorio del Admin", p_owner_name: "Admin" });

try {
  const { c: nc, session: nSession } = await login(nutriMail);

  // Base de datos: un nutriólogo no ve nada del panel
  check("nutriólogo no lee platform_admins", (await nc.from("platform_admins").select("user_id")).data?.length === 0 || !!(await nc.from("platform_admins").select("user_id")).error);
  check("nutriólogo no lee la bitácora", ((await nc.from("admin_actions").select("id")).data ?? []).length === 0);
  check("nutriólogo no lee la vista admin_clinics", !!(await nc.from("admin_clinics").select("id")).error);
  check("nutriólogo no ejecuta admin_metrics", !!(await nc.rpc("admin_metrics")).error);
  check("nutriólogo lee el aviso global", !(await nc.from("platform_settings").select("announcement").single()).error);
  const upd = await nc.from("platform_settings").update({ default_trial_days: 90 }).eq("id", 1).select();
  check("nutriólogo no cambia ajustes de plataforma", !upd.data?.length);
  const fake = await nc.from("admin_actions").insert({ action: "trial", reason: "falso", clinic_id: clinicId });
  check("nutriólogo no escribe en la bitácora", !!fake.error);
  const selfAdmin = await nc.from("platform_admins").insert({ user_id: nutri });
  check("nutriólogo no se hace admin", !!selfAdmin.error);
  const selfComp = await nc.from("clinics").update({ comp_until: new Date(Date.now() + 864e5 * 300).toISOString(), ai_budget_override_usd: 999 }).eq("id", clinicId).select();
  check("nutriólogo no se da cortesía ni tope de IA", !selfComp.data?.length);

  // Bitácora inmutable incluso para el service role
  const { data: row } = await admin.from("admin_actions").insert({ admin_id: boss, clinic_id: clinicId, action: "trial", reason: "prueba de inmutabilidad" }).select("id").single();
  check("bitácora: no se edita", !!(await admin.from("admin_actions").update({ reason: "x" }).eq("id", row.id)).error);
  check("bitácora: no se borra", !!(await admin.from("admin_actions").delete().eq("id", row.id)).error);

  // HTTP: acceso al panel
  check("sin sesión → /login", (await get("/admin")).headers.get("location")?.includes("/login"));
  const r404 = await get("/admin", nSession);
  check("nutriólogo no admin → 404", r404.status === 404, `status ${r404.status}`);
  check("export CSV para no admin → 404", (await get("/api/admin/export/consultorios", nSession)).status === 404);

  await admin.from("platform_admins").insert({ user_id: boss });
  const { c: bc, session: bSession1 } = await login(bossMail);
  const r2fa = await get("/admin", bSession1);
  check("admin sin 2FA → /admin-2fa", r2fa.headers.get("location")?.includes("/admin-2fa"), `status ${r2fa.status} ${r2fa.headers.get("location")}`);

  const { data: enroll } = await bc.auth.mfa.enroll({ factorType: "totp", friendlyName: `test-${stamp}` });
  const { error: ve } = await bc.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: totp(enroll.totp.secret) });
  if (ve) throw ve;
  const { data: { session: bSession2 } } = await bc.auth.getSession();
  const ok = await get("/admin", bSession2);
  const html = await ok.text();
  check("admin con 2FA ve el dashboard", ok.status === 200 && html.includes("Ingreso recurrente mensual"), `status ${ok.status}`);
  const detail = await get(`/admin/consultorios/${clinicId}`, bSession2);
  check("admin ve el detalle del consultorio", detail.status === 200 && (await detail.text()).includes("Admin Test Clinic"));
  const csv = await get("/api/admin/export/consultorios?q=Admin%20Test", bSession2);
  const csvText = await csv.text();
  check("CSV de consultorios", csv.status === 200 && csvText.includes("Admin Test Clinic") && csv.headers.get("content-type")?.includes("text/csv"));
  for (const p of ["/admin/consultorios", "/admin/pagos", "/admin/configuracion", "/admin/bitacora"]) {
    check(`página ${p}`, (await get(p, bSession2)).status === 200);
  }

  // Cortesía: vence con el cron
  await admin.from("clinics").update({ status: "activa", comp_until: new Date(Date.now() - 1000).toISOString(), current_period_end: new Date(Date.now() - 1000).toISOString() }).eq("id", clinicId);
  await admin.rpc("close_clinic_periods");
  check("cortesía vencida se cierra en el cron", (await admin.from("clinics").select("status").eq("id", clinicId).single()).data.status === "vencida");

  // Métricas
  const { data: m } = await admin.rpc("admin_metrics");
  check("métricas incluyen los consultorios", m.clinics.total >= 2 && Array.isArray(m.revenue_12m) && m.revenue_12m.length === 12);

  // Tope de IA propio sustituye al del plan
  await admin.from("clinics").update({ ai_budget_override_usd: 0, status: "activa", current_period_end: null }).eq("id", clinicId);
  const { data: rsv } = await admin.rpc("ai_reserve", { p_user: nutri, p_role: "nutriologo", p_model: "x", p_est_cost: 0.01 });
  check("tope de IA en 0 bloquea al consultorio", rsv?.ok === false && rsv.reason === "budget", JSON.stringify(rsv));
} finally {
  await admin.from("platform_admins").delete().eq("user_id", boss);
  await admin.from("clinics").delete().in("id", [clinicId, bossClinic]);
  for (const u of users) await admin.auth.admin.deleteUser(u);
}
console.log(fails ? `\n${fails} fallas` : "\nTodo bien");
process.exit(fails ? 1 : 0);
