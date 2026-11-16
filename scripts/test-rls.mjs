// Prueba de aislamiento (RLS) contra Supabase local.
// Uso: node --env-file=.env.local scripts/test-rls.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const PASS = `Prueba-${stamp}!`;
let failures = 0;
const check = (name, ok) => { console.log(`${ok ? "✔" : "✘"} ${name}`); if (!ok) failures++; };

async function mkPatient(tag) {
  const email = `rls-${tag}-${stamp}@example.test`;
  const { data: p, error } = await admin.from("patients").insert({ full_name: `Paciente ${tag}`, email, sex: "F", birth_date: "1990-01-01" }).select().single();
  if (error) throw error;
  const { data: u, error: e2 } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (e2) throw e2;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e3 } = await client.auth.signInWithPassword({ email, password: PASS });
  if (e3) throw e3;
  return { p, u: u.user, client };
}

const A = await mkPatient("a");
const B = await mkPatient("b");

// Datos clínicos de B creados por "el nutriólogo" (service role)
const { data: consB } = await admin.from("consultations").insert({ patient_id: B.p.id, subjective: "secreto" }).select().single();
await admin.from("quick_notes").insert({ patient_id: B.p.id, body: "nota privada" });
await admin.from("meal_plans").insert({ patient_id: B.p.id, kcal_target: 1800, status: "activo", meals: [] });
await admin.from("meal_plans").insert({ patient_id: A.p.id, kcal_target: 2000, status: "borrador", meals: [] });
await admin.from("consultations").insert({ patient_id: A.p.id, subjective: "nota de A" });

// Vinculación automática por correo
const { data: linked } = await admin.from("patients").select("user_id").eq("id", A.p.id).single();
check("El trigger vincula la cuenta con el expediente por correo", linked.user_id === A.u.id);

const c = A.client;
const { data: pts } = await c.from("patients").select("id");
check("Paciente no lee la tabla de expedientes (antecedentes, medicamentos)", (pts ?? []).length === 0);
const { data: mine } = await c.from("my_patient").select("*");
check("Paciente solo ve sus datos básicos", mine.length === 1 && mine[0].id === A.p.id && !("personal_history" in mine[0]));
await admin.from("anthropometry").insert({ patient_id: A.p.id, weight_kg: 70, notes: "nota privada de medición" });
const { data: rawAnth } = await c.from("anthropometry").select("notes");
const { data: myAnth } = await c.from("my_anthropometry").select("*");
check("Paciente no puede leer notas de sus mediciones", (rawAnth ?? []).length === 0 && myAnth.length === 1 && !("notes" in myAnth[0]));
await admin.from("recalls_24h").insert({ patient_id: A.p.id, captured_by: "nutriologo", items: [], notes: "nota privada de recordatorio" });
const { data: rawRec } = await c.from("recalls_24h").select("notes");
const { data: myRec } = await c.from("my_recalls").select("notes");
check("Paciente no puede leer notas de recordatorios capturados en consulta", (rawRec ?? []).length === 0 && myRec.length === 1 && myRec[0].notes === null);
const { data: cons } = await c.from("consultations").select("id");
check("Paciente no ve notas SOAP (ni las suyas)", cons.length === 0);
const { data: qn } = await c.from("quick_notes").select("id");
check("Paciente no ve notas rápidas", qn.length === 0);
const { data: plans } = await c.from("meal_plans").select("id");
check("Paciente no ve planes ajenos ni sus borradores", plans.length === 0);
const { data: foods } = await c.from("foods").select("id").limit(1);
check("Paciente lee el catálogo", foods.length === 1);

const { error: upRole } = await c.from("profiles").update({ role: "nutriologo" }).eq("id", A.u.id);
const { data: prof } = await admin.from("profiles").select("role").eq("id", A.u.id).single();
check("Paciente no puede auto-promoverse a nutriólogo", prof.role === "paciente" && !!upRole);

const { error: msgOther } = await c.from("messages").insert({ patient_id: B.p.id, sender_id: A.u.id, body: "hola" });
check("Paciente no puede escribir en el hilo de otro", !!msgOther);
const { error: msgOwn } = await c.from("messages").insert({ patient_id: A.p.id, sender_id: A.u.id, body: "hola" });
check("Paciente sí escribe en su hilo", !msgOwn);

const { error: r24 } = await c.from("recalls_24h").insert({ patient_id: A.p.id, captured_by: "nutriologo", items: [] });
check("Paciente no puede capturar R24h como nutriólogo", !!r24);
const { error: prog } = await c.from("progress_logs").insert({ patient_id: B.p.id, weight_kg: 60 });
check("Paciente no registra progreso de otro", !!prog);

const { error: rpc } = await c.rpc("ai_reserve", { p_user: A.u.id, p_role: "paciente", p_model: "x", p_est_cost: 0 });
check("Paciente no puede llamar ai_reserve directamente", !!rpc);
const { data: ai } = await c.from("ai_settings").select("*");
check("Paciente no lee configuración de IA", ai.length === 0);
const { data: cacheRows } = await c.from("ai_cache").select("id");
check("Paciente no lee la caché del asistente", !cacheRows || cacheRows.length === 0);

const up = await c.storage.from("patient-files").upload(`${B.p.id}/x.txt`, new Blob(["x"]), { contentType: "text/plain" });
check("Paciente no sube archivos a la carpeta de otro", !!up.error);

// Endurecimiento: límites que el paciente no puede saltarse llamando directo a la API
const html = await c.storage.from("patient-files").upload(`${A.p.id}/x.html`, new Blob(["<script>alert(1)</script>"]), { contentType: "text/html" });
check("Paciente no puede subir HTML a su carpeta", !!html.error);
const day = (n, h) => new Date(Date.now() + n * 864e5 + h * 36e5).toISOString();
const { error: longAppt } = await c.from("appointments").insert({ patient_id: A.p.id, starts_at: day(40, 0), ends_at: day(400, 0), status: "solicitada" });
check("Paciente no puede bloquear la agenda con una cita de meses", !!longAppt);
const { error: farAppt } = await c.from("appointments").insert({ patient_id: A.p.id, starts_at: day(300, 0), ends_at: day(300, 1), status: "solicitada" });
check("Paciente no agenda a más de 120 días", !!farAppt);
const appts = [];
for (let i = 0; i < 4; i++) appts.push((await c.from("appointments").insert({ patient_id: A.p.id, starts_at: day(50 + i, 0), ends_at: day(50 + i, 1), status: "solicitada" })).error);
check("Paciente tiene máximo 3 citas próximas", !appts[0] && !appts[1] && !appts[2] && !!appts[3]);
const { error: bigWeight } = await c.from("progress_logs").insert({ patient_id: A.p.id, weight_kg: 99999 });
check("Progreso rechaza valores imposibles", !!bigWeight);
const { data: attempts } = await c.from("login_attempts").select("id");
check("Paciente no lee el registro de intentos de acceso", !attempts || attempts.length === 0);

// Funciones nuevas: lo clínico y lo administrativo es solo del nutriólogo
await admin.from("lab_results").insert({ patient_id: A.p.id, values: { glucosa: 110 } });
await admin.from("payments").insert({ patient_id: A.p.id, concept: "Consulta", amount: 700 });
await admin.from("plan_templates").insert({ name: "Plantilla prueba", kcal_target: 1800 });
const [labsR, paysR, tplR] = await Promise.all([c.from("lab_results").select("id"), c.from("payments").select("id"), c.from("plan_templates").select("id")]);
check("Paciente no ve laboratorios, pagos ni plantillas", [labsR, paysR, tplR].every((r) => (r.data ?? []).length === 0));
const { error: payIns } = await c.from("payments").insert({ patient_id: A.p.id, concept: "x", amount: 1 });
check("Paciente no puede registrar pagos", !!payIns);
const { error: dayOwn } = await c.from("daily_logs").insert({ patient_id: A.p.id, water_glasses: 3, energy: 4 });
const { error: dayOther } = await c.from("daily_logs").insert({ patient_id: B.p.id, water_glasses: 3 });
check("Paciente registra su día, no el de otro", !dayOwn && !!dayOther);
await admin.from("daily_logs").insert({ patient_id: B.p.id, water_glasses: 5 });
const { data: days } = await c.from("daily_logs").select("patient_id");
check("Paciente solo ve su propio registro diario", days.length === 1 && days[0].patient_id === A.p.id);
const { error: photoComment } = await c.from("meal_photos").insert({ patient_id: A.p.id, path: `${A.p.id}/comidas/a.jpg`, meal: "Comida", comment: "me felicito" });
const { error: photoPath } = await c.from("meal_photos").insert({ patient_id: A.p.id, path: `${B.p.id}/comidas/a.jpg`, meal: "Comida" });
const { error: photoOk } = await c.from("meal_photos").insert({ patient_id: A.p.id, path: `${A.p.id}/comidas/b.jpg`, meal: "Comida" });
check("Foto de comida: sin comentario propio y solo en su carpeta", !!photoComment && !!photoPath && !photoOk);
const { data: upd } = await c.from("meal_photos").update({ comment: "editado por paciente" }).eq("patient_id", A.p.id).select("id");
check("Paciente no puede editar el comentario del nutriólogo", (upd ?? []).length === 0);
const { error: subOther } = await c.from("push_subscriptions").insert({ patient_id: B.p.id, endpoint: `https://push.example.test/${stamp}`, p256dh: "k".repeat(20), auth: "a".repeat(10) });
check("Paciente no suscribe notificaciones a nombre de otro", !!subOther);
const { data: logRows } = await c.from("push_log").select("key");
check("Paciente no lee la bitácora de notificaciones", !logRows || logRows.length === 0);
await admin.from("plan_templates").delete().eq("name", "Plantilla prueba");

// Nota firmada inmutable
await admin.from("consultations").update({ status: "firmada" }).eq("id", consB.id);
const { error: edit } = await admin.from("consultations").update({ subjective: "cambio" }).eq("id", consB.id);
check("Nota firmada no se puede modificar", !!edit && /firmada/i.test(edit.message));

// Presupuesto IA: con presupuesto 0 se bloquea
await admin.from("ai_settings").update({ monthly_budget_usd: 0 }).eq("id", 1);
const { data: res0 } = await admin.rpc("ai_reserve", { p_user: A.u.id, p_role: "paciente", p_model: "x", p_est_cost: 0.001 });
check("ai_reserve bloquea al superar el presupuesto", res0.ok === false && res0.reason === "budget");
await admin.from("ai_settings").update({ monthly_budget_usd: 10, per_minute_limit: 2 }).eq("id", 1);
const r1 = (await admin.rpc("ai_reserve", { p_user: A.u.id, p_role: "paciente", p_model: "x", p_est_cost: 0 })).data;
const r2 = (await admin.rpc("ai_reserve", { p_user: A.u.id, p_role: "paciente", p_model: "x", p_est_cost: 0 })).data;
const r3 = (await admin.rpc("ai_reserve", { p_user: A.u.id, p_role: "paciente", p_model: "x", p_est_cost: 0 })).data;
check("ai_reserve aplica límite por minuto", r1.ok && r2.ok && r3.ok === false && r3.reason === "rate");
await admin.from("ai_settings").update({ per_minute_limit: 5 }).eq("id", 1);

// Limpieza
await admin.from("ai_usage").delete().in("user_id", [A.u.id, B.u.id]);
await admin.from("consultations").delete().eq("patient_id", A.p.id);
await admin.auth.admin.deleteUser(A.u.id);
await admin.auth.admin.deleteUser(B.u.id);
await admin.from("patients").delete().eq("id", A.p.id);
// B tiene una nota firmada (inmutable): se queda como evidencia de prueba
console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodas las pruebas de RLS pasaron");
process.exit(failures ? 1 : 0);
