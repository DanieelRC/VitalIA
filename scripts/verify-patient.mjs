// Verificación de extremo a extremo como paciente de prueba: foto de comida (storage + políticas), cron de push.
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const c = createClient(URL_, ANON, { auth: { persistSession: false } });
const { error: e1 } = await c.auth.signInWithPassword({ email: process.env.DEV_PATIENT_EMAIL, password: process.env.DEV_PATIENT_PASSWORD });
if (e1) throw e1;
const { data: me } = await c.from("my_patient").select("id").single();
const log = (n, ok, extra = "") => console.log(`${ok ? "✔" : "✘"} ${n} ${extra}`);

// PNG 1×1 válido
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const path = `${me.id}/comidas/verify-${Date.now()}.png`;
const up = await c.storage.from("patient-files").upload(path, new Blob([png], { type: "image/png" }), { contentType: "image/png" });
log("Sube foto a su carpeta de comidas", !up.error, up.error?.message ?? "");
const ins = await c.from("meal_photos").insert({ patient_id: me.id, path, meal: "Comida", note: "Prueba" }).select("id").single();
log("Registra la foto", !ins.error, ins.error?.message ?? "");
const signed = await c.storage.from("patient-files").createSignedUrl(path, 60);
const img = signed.data ? await fetch(signed.data.signedUrl) : null;
log("Puede ver su propia foto (enlace firmado)", img?.status === 200 && img.headers.get("content-type") === "image/png");
const other = await c.storage.from("patient-files").createSignedUrl(`00000000-0000-0000-0000-000000000000/comidas/x.png`, 60);
log("No obtiene enlace a carpetas ajenas", !!other.error);

// Cron de push: sin secreto → 401; con secreto → responde
const base = process.env.NEXT_PUBLIC_SITE_URL;
const r1 = await fetch(`${base}/api/cron/push`);
log("Cron push rechaza sin secreto", r1.status === 401);
const r2 = await fetch(`${base}/api/cron/push`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
log("Cron push responde con secreto", r2.status === 200, JSON.stringify(await r2.json()));
console.log("photo_id=" + ins.data?.id);
