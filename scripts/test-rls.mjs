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

// Consultorio del nutriólogo de prueba (DEV_ADMIN_EMAIL)
const { data: devUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
const devId = devUsers.users.find((u) => u.email?.toLowerCase() === process.env.DEV_ADMIN_EMAIL?.toLowerCase())?.id;
const { data: devProf } = await admin.from("profiles").select("clinic_id").eq("id", devId ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
const CLINIC = devProf?.clinic_id;
if (!CLINIC) { console.error("El nutriólogo DEV_ADMIN_EMAIL no tiene consultorio"); process.exit(1); }
const { data: aiOrig } = await admin.from("ai_settings").select("monthly_budget_usd, per_minute_limit").eq("clinic_id", CLINIC).single();

async function mkPatient(tag) {
  const email = `rls-${tag}-${stamp}@example.test`;
  const { data: p, error } = await admin.from("patients").insert({ full_name: `Paciente ${tag}`, email, sex: "F", birth_date: "1990-01-01", clinic_id: CLINIC }).select().single();
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

// Las vistas del paciente son de solo lectura (antes corrían con privilegios del dueño y aceptaban escrituras)
const { data: anthRow } = await admin.from("anthropometry").select("id, weight_kg").eq("patient_id", A.p.id).limit(1).single();
const { data: recRow } = await admin.from("recalls_24h").select("id").eq("patient_id", A.p.id).eq("captured_by", "nutriologo").limit(1).single();
const viewWrites = await Promise.all([
  c.from("my_anthropometry").update({ weight_kg: 55 }).eq("id", anthRow.id),
  c.from("my_anthropometry").insert({ patient_id: B.p.id, weight_kg: 999 }),
  c.from("my_anthropometry").delete().eq("id", anthRow.id),
  c.from("my_recalls").delete().eq("id", recRow.id),
  c.from("my_patient").update({ pathologies: ["ninguna"], email: `cambiado-${stamp}@example.test` }).eq("id", A.p.id),
  c.from("my_patient").insert({ full_name: "Fantasma", email: `fantasma-${stamp}@example.test` }),
]);
const [{ data: anthAfter }, { data: recAfter }, { data: injected }, { data: pAfter }, { data: ghost }] = await Promise.all([
  admin.from("anthropometry").select("weight_kg").eq("id", anthRow.id).maybeSingle(),
  admin.from("recalls_24h").select("id").eq("id", recRow.id).maybeSingle(),
  admin.from("anthropometry").select("id").eq("patient_id", B.p.id).eq("weight_kg", 999),
  admin.from("patients").select("email, pathologies").eq("id", A.p.id).single(),
  admin.from("patients").select("id").eq("email", `fantasma-${stamp}@example.test`),
]);
check("Las vistas del paciente rechazan INSERT/UPDATE/DELETE", viewWrites.every((r) => !!r.error));
check("Paciente no altera ni borra mediciones o R24h de consulta vía vistas",
  Number(anthAfter?.weight_kg) === Number(anthRow.weight_kg) && !!recAfter);
check("Paciente no inserta mediciones en el expediente de otro ni crea expedientes", (injected ?? []).length === 0 && (ghost ?? []).length === 0);
check("Paciente no edita su correo ni patologías vía my_patient", pAfter.email === A.p.email && !(pAfter.pathologies ?? []).includes("ninguna"));

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
await admin.from("plan_templates").insert({ name: "Plantilla prueba", kcal_target: 1800, clinic_id: CLINIC });
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

// ---- Estudio, personalización y seguimiento diario ----
const today = new Date().toISOString().slice(0, 10);
const { error: mcOwn } = await c.from("meal_checks").upsert({ patient_id: A.p.id, day: today, meal: 0, done: true }, { onConflict: "patient_id,day,meal" });
check("Paciente marca como hecha una comida suya", !mcOwn);
const { error: mcOther } = await c.from("meal_checks").insert({ patient_id: B.p.id, day: today, meal: 0, done: true });
check("Paciente no puede marcar comidas de otro paciente", !!mcOther);
const { error: mcOld } = await c.from("meal_checks").insert({ patient_id: A.p.id, day: "2020-01-01", meal: 1, done: true });
check("Paciente no puede registrar comidas de fechas lejanas", !!mcOld);
await admin.from("meal_checks").insert({ patient_id: B.p.id, day: today, meal: 2, done: true });
const { data: mcSeen } = await c.from("meal_checks").select("patient_id");
check("Paciente solo ve sus propias comidas marcadas", mcSeen.length === 1 && mcSeen[0].patient_id === A.p.id);

await admin.from("patients").update({ target_weight_kg: 62.5, custom: { c_secreto: "dato interno" } }).eq("id", A.p.id);
const { data: mine2 } = await c.from("my_patient").select("*").single();
check("Paciente ve su peso meta pero no los campos propios del consultorio", Number(mine2.target_weight_kg) === 62.5 && !("custom" in mine2) && !("personal_history" in mine2));

for (const t of ["macro_presets", "meal_presets", "custom_formulas", "custom_factors", "custom_fields", "soap_templates"]) {
  const { data: rows } = await c.from(t).select("id").limit(1);
  const { error: ins } = await c.from(t).insert(t === "custom_factors" ? { kind: "actividad", label: "x", value: 1.5 } : t === "custom_formulas" ? { name: "x", expression: "peso" } : t === "custom_fields" ? { key: "c_x", label: "x" } : t === "macro_presets" ? { name: "x", protein_pct: 20, fat_pct: 30, carbs_pct: 50 } : t === "meal_presets" ? { name: "x", meals: [] } : { name: "x" });
  check(`Paciente no lee ni escribe ${t}`, (rows ?? []).length === 0 && !!ins);
}
const { error: grpEdit, data: grpRows } = await c.from("equivalent_groups").update({ kcal: 999 }).eq("code", "frutas").select("code");
check("Paciente no puede cambiar el aporte de los equivalentes", !!grpEdit || (grpRows ?? []).length === 0);

// Fotos de recetas: el nutriólogo sube, el paciente solo ve
const staff = createClient(URL, ANON, { auth: { persistSession: false } });
const { error: staffErr } = await staff.auth.signInWithPassword({ email: process.env.DEV_ADMIN_EMAIL, password: process.env.DEV_ADMIN_PASSWORD });
if (staffErr) { check("Sesión de nutriólogo de prueba (DEV_ADMIN_*)", false); }
else {
  // PNG de 1×1
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const { data: baseRecipe } = await admin.from("recipes").select("id, name, image_path").eq("is_base", true).limit(1).single();
  const { data: own, error: ownErr } = await staff.from("recipes").insert({ name: `Receta RLS ${stamp}` }).select("id").single();
  check("Nutriólogo crea una receta propia", !ownErr);
  const path = `${CLINIC}/${own?.id}/rls-${stamp}.png`;
  const { error: upPatient } = await c.storage.from("recipes").upload(`${CLINIC}/x-${stamp}.png`, png, { contentType: "image/png" });
  check("Paciente no puede subir fotos de recetas", !!upPatient);
  const { error: upStaff } = await staff.storage.from("recipes").upload(path, png, { contentType: "image/png" });
  check("Nutriólogo sube la foto de una receta", !upStaff);
  const { error: imgErr } = await staff.from("recipes").update({ image_path: path }).eq("id", own?.id);
  check("La foto de una receta propia se puede cambiar", !imgErr);
  const { data: baseUpd } = await staff.from("recipes").update({ image_path: path }).eq("id", baseRecipe.id).select("id");
  check("Las recetas del catálogo base (compartido) no se modifican", (baseUpd ?? []).length === 0);
  const { data: signed } = await c.storage.from("recipes").createSignedUrl(path, 60);
  check("Paciente puede ver la foto de la receta", !!signed?.signedUrl);
  const { error: rmPatient, data: rmRows } = await c.storage.from("recipes").remove([path]);
  check("Paciente no puede borrar fotos de recetas", !!rmPatient || (rmRows ?? []).length === 0);
  await staff.storage.from("recipes").remove([path]);
  await staff.from("recipes").delete().eq("id", own?.id);
}

// ---- Aislamiento entre consultorios y límites del plan ----
const N2mail = `rls-n2-${stamp}@example.test`;
const { data: n2u } = await admin.auth.admin.createUser({ email: N2mail, password: PASS, email_confirm: true });
const { data: CLINIC2, error: ccErr } = await admin.rpc("create_clinic", { p_owner: n2u.user.id, p_name: "Consultorio RLS 2", p_owner_name: "Nutrióloga Dos" });
check("create_clinic crea un consultorio en prueba", !ccErr && !!CLINIC2);
const n2 = createClient(URL, ANON, { auth: { persistSession: false } });
await n2.auth.signInWithPassword({ email: N2mail, password: PASS });
const { error: ccPublic } = await n2.rpc("create_clinic", { p_owner: n2u.user.id, p_name: "x", p_owner_name: "x" });
check("Un usuario no puede llamar create_clinic", !!ccPublic);

const { error: foodErr } = await admin.from("foods").insert({ name: `Alimento propio ${stamp}`, portion: "1 pieza", clinic_id: CLINIC, is_base: false });
if (foodErr) throw foodErr;
const [p2, cons2, msg2, set2, ai2, grp2, foods2, cl2, tpl2] = await Promise.all([
  n2.from("patients").select("clinic_id"),
  n2.from("consultations").select("id"),
  n2.from("messages").select("id"),
  n2.from("clinic_settings").select("clinic_id"),
  n2.from("ai_settings").select("clinic_id"),
  n2.from("equivalent_groups").select("clinic_id"),
  n2.from("foods").select("clinic_id").not("clinic_id", "is", null),
  n2.from("clinics").select("id"),
  n2.from("plan_templates").select("id"),
]);
check("Otro consultorio no ve pacientes, consultas ni mensajes ajenos", (p2.data ?? []).length === 0 && (cons2.data ?? []).length === 0 && (msg2.data ?? []).length === 0);
check("Otro consultorio solo ve su configuración y su IA", set2.data?.length === 1 && set2.data[0].clinic_id === CLINIC2 && ai2.data?.length === 1 && ai2.data[0].clinic_id === CLINIC2);
check("Otro consultorio tiene su propia copia de los grupos de equivalentes", (grp2.data ?? []).length > 0 && grp2.data.every((g) => g.clinic_id === CLINIC2));
check("Otro consultorio no ve los alimentos propios de otro", !foods2.error && (foods2.data ?? []).every((f) => f.clinic_id === CLINIC2));
check("Otro consultorio solo ve su propio registro de consultorio", cl2.data?.length === 1 && cl2.data[0].id === CLINIC2 && (tpl2.data ?? []).length === 0);
const { error: hijack } = await n2.from("patients").insert({ full_name: "Intruso", email: `intruso-${stamp}@example.test`, clinic_id: CLINIC });
check("No se puede crear un paciente en otro consultorio", !!hijack);
const { data: updA } = await n2.from("patients").update({ full_name: "cambiado" }).eq("id", A.p.id).select("id");
check("No se puede modificar un paciente de otro consultorio", (updA ?? []).length === 0);
await admin.storage.from("patient-files").upload(`${A.p.id}/rls-${stamp}.txt`, new Blob(["privado"]), { contentType: "text/plain" });
const { data: sigA } = await n2.storage.from("patient-files").createSignedUrl(`${A.p.id}/rls-${stamp}.txt`, 60);
check("Otro consultorio no abre archivos de pacientes ajenos", !sigA?.signedUrl);
const { error: upClinic } = await n2.storage.from("clinic").upload(`${CLINIC}/logo.png`, new Blob(["x"]), { contentType: "image/png", upsert: true });
check("Otro consultorio no sube archivos a la carpeta ajena", !!upClinic);
await admin.storage.from("patient-files").remove([`${A.p.id}/rls-${stamp}.txt`]);

// ---- Privacidad: consentimientos y derechos ARCO ----
const { error: selfConsent } = await c.from("legal_acceptances").insert({ patient_id: A.p.id, document: "aviso_paciente", version: "x" });
check("Paciente no puede fabricar evidencia de consentimiento", !!selfConsent);
const { data: arcoA, error: arcoErr } = await c.from("arco_requests")
  .insert({ patient_id: A.p.id, requested_by: A.u.id, kind: "rectificacion", details: "Mi peso inicial está mal", status: "procedente", response: "hecho" })
  .select("id, status, response, clinic_id, due_at").single();
check("Paciente envía una solicitud ARCO; el estado y la respuesta no los decide él", !arcoErr && arcoA.status === "recibida" && arcoA.response === null && arcoA.clinic_id === CLINIC && Date.parse(arcoA.due_at) > Date.now() + 20 * 864e5);
const { error: arcoOther } = await c.from("arco_requests").insert({ patient_id: B.p.id, requested_by: A.u.id, kind: "acceso", details: "datos de otra persona" });
check("Paciente no hace solicitudes a nombre de otro", !!arcoOther);
const { data: arcoUpd } = await c.from("arco_requests").update({ status: "procedente" }).eq("id", arcoA?.id).select("id");
check("Paciente no puede cambiar el estado de su solicitud", (arcoUpd ?? []).length === 0);
const { data: n2Arco } = await n2.from("arco_requests").select("id");
const { data: n2Legal } = await n2.from("legal_acceptances").select("id").eq("patient_id", A.p.id);
check("Otro consultorio no ve solicitudes ARCO ni consentimientos ajenos", (n2Arco ?? []).length === 0 && (n2Legal ?? []).length === 0);
if (!staffErr) {
  const { data: resp } = await staff.from("arco_requests").update({ status: "procedente", response: "Corregido", details: "cambiado por el consultorio" }).eq("id", arcoA.id).select("status, details, responded_at").single();
  check("El consultorio responde, pero no puede alterar lo que pidió el paciente", resp?.status === "procedente" && resp.details === "Mi peso inicial está mal" && !!resp.responded_at);
  const { data: del } = await staff.from("arco_requests").delete().eq("id", arcoA.id).select("id");
  check("Las solicitudes ARCO no se pueden borrar", (del ?? []).length === 0);
  const { error: paper } = await staff.from("legal_acceptances").insert({ patient_id: A.p.id, document: "aviso_paciente", version: "v", method: "papel", recorded_by: devId });
  const { error: paperFake } = await staff.from("legal_acceptances").insert({ patient_id: A.p.id, document: "aviso_paciente", version: "v", method: "electronico", recorded_by: devId });
  check("El consultorio registra firmas en papel, pero no aceptaciones electrónicas", !paper && !!paperFake);
  // El correo y la cuenta de un expediente activado no se cambian (los enlaces de acceso salen de ese correo)
  const { error: mailLocked } = await staff.from("patients").update({ email: `otra-cuenta-${stamp}@example.test` }).eq("id", A.p.id);
  const { error: userLocked } = await staff.from("patients").update({ user_id: B.u.id }).eq("id", A.p.id);
  const { data: idAfter } = await admin.from("patients").select("email, user_id").eq("id", A.p.id).single();
  check("El consultorio no cambia el correo ni la cuenta de un expediente activado", !!mailLocked && !!userLocked && idAfter.email === A.p.email && idAfter.user_id === A.u.id);
  const { error: sameMail } = await staff.from("patients").update({ email: A.p.email.toUpperCase() }).eq("id", A.p.id);
  check("Guardar el expediente con el mismo correo (otra capitalización) sigue funcionando", !sameMail);
  const { data: legDel } = await staff.from("legal_acceptances").delete().eq("patient_id", A.p.id).select("id");
  check("La evidencia de consentimiento no se puede borrar", (legDel ?? []).length === 0);
}
await admin.from("arco_requests").delete().eq("patient_id", A.p.id);

const { data: aSeesClinics } = await c.from("clinics").select("id");
check("Paciente solo ve su consultorio", (aSeesClinics ?? []).length === 1 && aSeesClinics[0].id === CLINIC);
const { data: aChoose } = await c.rpc("choose_plan", { p_code: "pmax" });
check("Paciente no puede cambiar el plan", aChoose?.ok === false);

// Límite de pacientes activos (plan Inicio: 5)
const ins = [];
for (let i = 1; i <= 6; i++) ins.push((await n2.from("patients").insert({ full_name: `Límite ${i}`, email: `lim${i}-${stamp}@example.test` }).select("id").single()));
check("Plan Inicio admite 5 pacientes activos", ins.slice(0, 5).every((r) => !r.error));
check("El sexto paciente activo se rechaza con PLAN_LIMITE", /PLAN_LIMITE:5/.test(ins[5].error?.message ?? ""));
const { error: inactiveOk } = await n2.from("patients").insert({ full_name: "Inactivo", email: `inac-${stamp}@example.test`, active: false });
check("Los pacientes inactivos no cuentan para el límite", !inactiveOk);
const { data: lastInactive } = await n2.from("patients").select("id").eq("active", false).single();
const { error: reactErr } = await n2.from("patients").update({ active: true }).eq("id", lastInactive.id);
check("Reactivar por encima del límite se rechaza", /PLAN_LIMITE/.test(reactErr?.message ?? ""));
const { data: up10 } = await n2.rpc("choose_plan", { p_code: "p10" });
const { error: sixth } = await n2.from("patients").update({ active: true }).eq("id", lastInactive.id);
check("Al subir de plan en la prueba se libera el límite", up10?.ok === true && !sixth);
const { data: down5 } = await n2.rpc("choose_plan", { p_code: "p5" });
check("No se baja a un plan menor que los pacientes activos", down5?.ok === false && down5.reason === "patients");
await admin.from("clinics").update({ trial_ends_at: new Date(Date.now() - 864e5).toISOString() }).eq("id", CLINIC2);
const { error: expired } = await n2.from("patients").insert({ full_name: "Tras vencer", email: `venc-${stamp}@example.test`, active: false });
const { error: expiredAct } = await n2.from("patients").update({ active: true }).eq("id", ins[0].data.id);
const { data: aiExp } = await admin.rpc("ai_reserve", { p_user: n2u.user.id, p_role: "nutriologo", p_model: "x", p_est_cost: 0 });
const { data: chExp } = await n2.rpc("choose_plan", { p_code: "pmax" });
check("Con la prueba vencida: se consulta, pero no se agregan pacientes activos ni se usa la IA", !expired && !expiredAct && aiExp?.reason === "plan" && chExp?.reason === "billing");
const { error: expiredNew } = await n2.from("patients").insert({ full_name: "Activo tras vencer", email: `venc2-${stamp}@example.test` });
check("Con la prueba vencida un paciente activo nuevo se rechaza (PLAN_INACTIVO)", /PLAN_INACTIVO/.test(expiredNew?.message ?? ""));
await admin.from("clinics").delete().eq("id", CLINIC2);
await admin.auth.admin.deleteUser(n2u.user.id);
await admin.from("foods").delete().eq("name", `Alimento propio ${stamp}`);

// Nota firmada inmutable
await admin.from("consultations").update({ status: "firmada" }).eq("id", consB.id);
const { error: edit } = await admin.from("consultations").update({ subjective: "cambio" }).eq("id", consB.id);
check("Nota firmada no se puede modificar", !!edit && /firmada/i.test(edit.message));

// Presupuesto IA: con presupuesto 0 se bloquea
await admin.from("ai_settings").update({ monthly_budget_usd: 0 }).eq("clinic_id", CLINIC);
const { data: res0 } = await admin.rpc("ai_reserve", { p_user: A.u.id, p_role: "paciente", p_model: "x", p_est_cost: 0.001 });
check("ai_reserve bloquea al superar el presupuesto", res0.ok === false && res0.reason === "budget");
await admin.from("ai_settings").update({ monthly_budget_usd: 10, per_minute_limit: 2 }).eq("clinic_id", CLINIC);
const r1 = (await admin.rpc("ai_reserve", { p_user: A.u.id, p_role: "paciente", p_model: "x", p_est_cost: 0 })).data;
const r2 = (await admin.rpc("ai_reserve", { p_user: A.u.id, p_role: "paciente", p_model: "x", p_est_cost: 0 })).data;
const r3 = (await admin.rpc("ai_reserve", { p_user: A.u.id, p_role: "paciente", p_model: "x", p_est_cost: 0 })).data;
check("ai_reserve aplica límite por minuto", r1.ok && r2.ok && r3.ok === false && r3.reason === "rate");
await admin.from("ai_settings").update(aiOrig).eq("clinic_id", CLINIC);

// Limpieza
await admin.from("ai_usage").delete().in("user_id", [A.u.id, B.u.id]);
await admin.from("consultations").delete().eq("patient_id", A.p.id);
await admin.auth.admin.deleteUser(A.u.id);
await admin.auth.admin.deleteUser(B.u.id);
await admin.from("patients").delete().eq("id", A.p.id);
// B tiene una nota firmada (inmutable): se queda como evidencia de prueba
console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodas las pruebas de RLS pasaron");
process.exit(failures ? 1 : 0);
