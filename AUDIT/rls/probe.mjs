// Sondas de auditoría contra Supabase LOCAL (no modifica la app). Uso:
//   node --env-file=.env.local AUDIT/rls/probe.mjs
// Crea dos pacientes de prueba en el consultorio de DEV_ADMIN_EMAIL, intenta escrituras que RLS debería impedir y limpia.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!/127\.0\.0\.1|localhost/.test(URL ?? "")) { console.error("Solo contra Supabase local"); process.exit(1); }
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const PASS = `Probe-${stamp}!a1`;
const out = [];
const rec = (name, vulnerable, detail = "") => { out.push({ name, vulnerable, detail }); console.log(`${vulnerable ? "VULNERABLE" : "ok        "} ${name}${detail ? " — " + detail : ""}`); };

const { data: us } = await admin.auth.admin.listUsers({ perPage: 1000 });
const devId = us.users.find((u) => u.email?.toLowerCase() === process.env.DEV_ADMIN_EMAIL?.toLowerCase())?.id;
const { data: prof } = await admin.from("profiles").select("clinic_id").eq("id", devId).single();
const CLINIC = prof.clinic_id;

async function mk(tag) {
  const email = `probe-${tag}-${stamp}@example.test`;
  const { data: p } = await admin.from("patients").insert({ full_name: `Probe ${tag}`, email, clinic_id: CLINIC, medications: "metformina", personal_history: "secreto" }).select().single();
  const { data: u } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: PASS });
  return { p, u: u.user, c };
}
const A = await mk("a");
const B = await mk("b");
const { data: anthB } = await admin.from("anthropometry").insert({ patient_id: B.p.id, weight_kg: 80, notes: "nota B" }).select().single();
const { data: anthA } = await admin.from("anthropometry").insert({ patient_id: A.p.id, weight_kg: 70, notes: "nota A" }).select().single();
const { data: recA } = await admin.from("recalls_24h").insert({ patient_id: A.p.id, captured_by: "nutriologo", items: [], notes: "nota consulta" }).select().single();

// 1. Escritura a través de las vistas (security definer por omisión, auto-actualizables)
let r = await A.c.from("my_anthropometry").update({ weight_kg: 55 }).eq("id", anthA.id).select("id");
let row = (await admin.from("anthropometry").select("weight_kg").eq("id", anthA.id).single()).data;
rec("Paciente modifica su medición clínica vía my_anthropometry (UPDATE)", Number(row.weight_kg) === 55, r.error?.message ?? `peso ahora ${row.weight_kg}`);

r = await A.c.from("my_anthropometry").insert({ patient_id: B.p.id, weight_kg: 999, measured_at: "2026-01-01" }).select("id");
const { data: inj } = await admin.from("anthropometry").select("id").eq("patient_id", B.p.id).eq("weight_kg", 999);
rec("Paciente A inserta mediciones en el expediente de B vía my_anthropometry (INSERT)", (inj ?? []).length > 0, r.error?.message ?? "fila insertada");

r = await A.c.from("my_recalls").delete().eq("id", recA.id).select("id");
const { data: recLeft } = await admin.from("recalls_24h").select("id").eq("id", recA.id);
rec("Paciente borra un R24h capturado por el nutriólogo vía my_recalls (DELETE)", (recLeft ?? []).length === 0, r.error?.message ?? "borrado");

r = await A.c.from("my_patient").update({ pathologies: ["ninguna"], email: `cambiado-${stamp}@example.test` }).eq("id", A.p.id).select("id");
row = (await admin.from("patients").select("pathologies, email").eq("id", A.p.id).single()).data;
rec("Paciente edita patologías/correo de su expediente vía my_patient (UPDATE)", row.pathologies?.[0] === "ninguna", r.error?.message ?? JSON.stringify(row));

r = await A.c.from("my_patient").insert({ full_name: "Fantasma", email: `fantasma-${stamp}@example.test` }).select("id");
const { data: ghost } = await admin.from("patients").select("id, clinic_id").eq("email", `fantasma-${stamp}@example.test`);
rec("Paciente crea expedientes nuevos en su consultorio vía my_patient (INSERT)", (ghost ?? []).length > 0, r.error?.message ?? JSON.stringify(ghost));

r = await A.c.from("my_anthropometry").delete().eq("id", anthA.id).select("id");
const { data: anthLeft } = await admin.from("anthropometry").select("id").eq("id", anthA.id);
rec("Paciente borra su medición clínica vía my_anthropometry (DELETE)", (anthLeft ?? []).length === 0, r.error?.message ?? "borrado");

// 2. Lectura cruzada a través de vistas
const { data: vB } = await A.c.from("my_anthropometry").select("id").eq("patient_id", B.p.id);
rec("Paciente A lee mediciones de B vía vista", (vB ?? []).length > 0);
const { data: vP } = await A.c.from("my_patient").select("*");
rec("my_patient expone medicamentos/antecedentes", (vP ?? []).some((x) => "medications" in x || "personal_history" in x));

// 3. Anónimo
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const anonViews = await anon.from("my_patient").select("id");
rec("Anónimo lee my_patient", (anonViews.data ?? []).length > 0, anonViews.error?.message ?? "");
const anonRpc = await anon.rpc("busy_slots", { p_from: "2020-01-01", p_to: "2030-01-01" });
rec("Anónimo obtiene horarios ocupados (busy_slots)", (anonRpc.data ?? []).length > 0, anonRpc.error?.message ?? `${(anonRpc.data ?? []).length} filas`);

// 4. Archivos: un paciente registra un anexo que apunta a un archivo oculto de su carpeta
const hidden = `${A.p.id}/oculto-${stamp}.pdf`;
await admin.storage.from("patient-files").upload(hidden, new Blob(["%PDF-1.4 oculto"]), { contentType: "application/pdf" });
await admin.from("attachments").insert({ patient_id: A.p.id, path: hidden, name: "oculto", mime: "application/pdf", size: 10, visible_to_patient: false, uploaded_by: devId });
const s0 = await A.c.storage.from("patient-files").createSignedUrl(hidden, 60);
await A.c.from("attachments").insert({ patient_id: A.p.id, path: hidden, name: "x", mime: "application/pdf", size: 1, uploaded_by: A.u.id, visible_to_patient: true });
const s1 = await A.c.storage.from("patient-files").createSignedUrl(hidden, 60);
rec("Paciente abre un anexo oculto registrando su propia fila de attachments con la misma ruta", !s0.data?.signedUrl && !!s1.data?.signedUrl, "requiere conocer la ruta (UUID aleatorio)");

// 5. Mensajes: el paciente edita o borra mensajes
await admin.from("messages").insert({ patient_id: A.p.id, sender_id: devId, body: "mensaje del nutriólogo" });
const mu = await A.c.from("messages").update({ body: "alterado" }).eq("patient_id", A.p.id).select("id");
rec("Paciente altera mensajes del hilo", (mu.data ?? []).length > 0);

// 6. Firma: borrar una nota firmada
const { data: cons } = await admin.from("consultations").insert({ patient_id: A.p.id, subjective: "x" }).select().single();
await admin.from("consultations").update({ status: "firmada" }).eq("id", cons.id);
const staff = createClient(URL, ANON, { auth: { persistSession: false } });
const se = await staff.auth.signInWithPassword({ email: process.env.DEV_ADMIN_EMAIL, password: process.env.DEV_ADMIN_PASSWORD });
if (!se.error) {
  const del = await staff.from("consultations").delete().eq("id", cons.id).select("id");
  const { data: still } = await admin.from("consultations").select("id").eq("id", cons.id);
  rec("Nutriólogo borra una nota SOAP firmada", (still ?? []).length === 0, del.error?.message ?? "");
  const delP = await staff.from("patients").delete().eq("id", A.p.id).select("id");
  const { data: stillP } = await admin.from("patients").select("id").eq("id", A.p.id);
  rec("Nutriólogo borra un expediente completo con notas firmadas (cascade)", (stillP ?? []).length === 0, delP.error?.message ?? "");
}

// Limpieza (best effort)
for (const P of [A, B]) {
  await admin.storage.from("patient-files").remove([hidden]);
  await admin.from("consultations").delete().eq("patient_id", P.p.id);
  await admin.from("patients").delete().eq("id", P.p.id);
  await admin.auth.admin.deleteUser(P.u.id);
}
await admin.from("patients").delete().eq("email", `fantasma-${stamp}@example.test`);
console.log(JSON.stringify(out, null, 2));
