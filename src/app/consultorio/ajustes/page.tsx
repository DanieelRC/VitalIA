import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionForm, SubmitButton, type FormState } from "@/components/form";
import { Alert, Card, Field, fmtDateTime, Input, PageHeader, Stat, Table, Td } from "@/components/ui";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Ajustes" };

async function saveClinic(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireRole("nutriologo");
  const t = (k: string) => String(fd.get(k) ?? "").trim().slice(0, 300) || null;
  const supabase = await createClient();
  let logo_path: string | undefined;
  const logo = fd.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!["image/png", "image/jpeg"].includes(logo.type) || logo.size > 2e6) return { error: "Logo PNG o JPG de máximo 2 MB." };
    logo_path = `logo.${logo.type === "image/png" ? "png" : "jpg"}`;
    const up = await supabase.storage.from("clinic").upload(logo_path, logo, { contentType: logo.type, upsert: true });
    if (up.error) return { error: up.error.message };
  }
  const { error } = await supabase.from("clinic_settings").update({
    name: t("name") ?? "Consultorio de Nutrición", nutritionist_name: t("nutritionist_name"), license: t("license"),
    address: t("address"), phone: t("phone"), email: t("email"), ...(logo_path ? { logo_path } : {}), updated_at: new Date().toISOString(),
  }).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/consultorio/ajustes");
  return { ok: "Datos del consultorio guardados." };
}

async function saveAi(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireRole("nutriologo");
  const d = z.object({
    monthly_budget_usd: z.coerce.number().min(0).max(10000),
    pro_reserve_pct: z.coerce.number().min(0).max(100),
    patient_daily_messages: z.coerce.number().int().min(0).max(1000),
    patient_monthly_tokens: z.coerce.number().int().min(0).max(100_000_000),
    per_minute_limit: z.coerce.number().int().min(1).max(60),
    max_input_chars: z.coerce.number().int().min(100).max(20000),
    max_output_tokens: z.coerce.number().int().min(100).max(8000),
    pro_max_output_tokens: z.coerce.number().int().min(100).max(16000),
    history_turns: z.coerce.number().int().min(0).max(30),
  }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: "Valores fuera de rango: " + d.error.issues[0].path.join(".") };
  const supabase = await createClient();
  const { error } = await supabase.from("ai_settings").update({ ...d.data, enabled: fd.get("enabled") === "on", updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/consultorio/ajustes");
  return { ok: "Límites de IA guardados." };
}

export default async function Settings() {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [clinic, ai, usage, recent, profiles] = await Promise.all([
    supabase.from("clinic_settings").select("*").eq("id", 1).single(),
    supabase.from("ai_settings").select("*").eq("id", 1).single(),
    supabase.from("ai_usage").select("user_id, role, input_tokens, output_tokens, cost_usd, status, created_at").gte("created_at", monthStart),
    supabase.from("ai_messages").select("user_id, role, content, blocked_reason, created_at").order("created_at", { ascending: false }).limit(40),
    supabase.from("patients").select("user_id, full_name").not("user_id", "is", null),
  ]);
  const c = clinic.data!, a = ai.data!;
  const names = Object.fromEntries((profiles.data ?? []).map((p) => [p.user_id, p.full_name]));
  const rows = usage.data ?? [];
  const spent = rows.reduce((x, r) => x + Number(r.cost_usd), 0);
  const byUser = new Map<string, { calls: number; tokens: number; cost: number; role: string }>();
  for (const r of rows) {
    const u = byUser.get(r.user_id) ?? { calls: 0, tokens: 0, cost: 0, role: r.role };
    u.calls++; u.tokens += r.input_tokens + r.output_tokens; u.cost += Number(r.cost_usd);
    byUser.set(r.user_id, u);
  }
  const pct = a.monthly_budget_usd ? Math.round((spent / a.monthly_budget_usd) * 100) : 0;

  return (
    <>
      <PageHeader title="Ajustes del consultorio e IA" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Datos del consultorio (aparecen en los PDF)">
          <ActionForm action={saveClinic} className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre del consultorio"><Input name="name" defaultValue={c.name} /></Field>
            <Field label="Nutriólogo(a)"><Input name="nutritionist_name" defaultValue={c.nutritionist_name ?? ""} /></Field>
            <Field label="Cédula profesional"><Input name="license" defaultValue={c.license ?? ""} /></Field>
            <Field label="Teléfono"><Input name="phone" defaultValue={c.phone ?? ""} /></Field>
            <Field label="Correo (recibe alertas)"><Input name="email" type="email" defaultValue={c.email ?? ""} /></Field>
            <Field label="Dirección"><Input name="address" defaultValue={c.address ?? ""} /></Field>
            <Field label="Logo (PNG/JPG)" hint={c.logo_path ? "Ya hay un logo cargado" : undefined}><Input type="file" name="logo" accept="image/png,image/jpeg" className="py-2" /></Field>
            <div className="flex items-end"><SubmitButton size="sm">Guardar</SubmitButton></div>
          </ActionForm>
        </Card>

        <Card title="Límites del asistente IA (Grok)">
          <ActionForm action={saveAi} className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={a.enabled} /> Asistente activado (interruptor de emergencia)</label>
            <Field label="Presupuesto mensual (USD)"><Input name="monthly_budget_usd" defaultValue={a.monthly_budget_usd} inputMode="decimal" /></Field>
            <Field label="Reserva para nutriólogo (%)" hint="Los pacientes se bloquean antes"><Input name="pro_reserve_pct" defaultValue={a.pro_reserve_pct} /></Field>
            <Field label="Mensajes/día por paciente"><Input name="patient_daily_messages" defaultValue={a.patient_daily_messages} /></Field>
            <Field label="Tokens/mes por paciente"><Input name="patient_monthly_tokens" defaultValue={a.patient_monthly_tokens} /></Field>
            <Field label="Mensajes por minuto (todos)"><Input name="per_minute_limit" defaultValue={a.per_minute_limit} /></Field>
            <Field label="Caracteres máx. por mensaje"><Input name="max_input_chars" defaultValue={a.max_input_chars} /></Field>
            <Field label="Tokens de respuesta (paciente)"><Input name="max_output_tokens" defaultValue={a.max_output_tokens} /></Field>
            <Field label="Tokens de respuesta (nutriólogo)"><Input name="pro_max_output_tokens" defaultValue={a.pro_max_output_tokens} /></Field>
            <Field label="Turnos de historial enviados"><Input name="history_turns" defaultValue={a.history_turns} /></Field>
            <div className="col-span-2"><SubmitButton size="sm">Guardar límites</SubmitButton></div>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">Configura también un límite de gasto en la consola de xAI como respaldo. El costo se calcula con XAI_PRICES.</p>
        </Card>
      </div>

      <h2 className="mb-3 mt-6 font-semibold">Consumo del mes</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gasto" value={`$${spent.toFixed(3)}`} hint={`${pct} % de $${a.monthly_budget_usd}`} />
        <Stat label="Llamadas" value={rows.length} />
        <Stat label="Tokens" value={rows.reduce((x, r) => x + r.input_tokens + r.output_tokens, 0).toLocaleString("es-MX")} />
        <Stat label="Errores" value={rows.filter((r) => r.status === "error").length} />
      </div>
      {pct >= 80 && <div className="mt-3"><Alert tone={pct >= 100 ? "danger" : "warn"}>{pct >= 100 ? "Presupuesto agotado: el asistente está bloqueado." : "Se superó el 80 % del presupuesto."}</Alert></div>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Por usuario">
          <Table head={["Usuario", "Llamadas", "Tokens", "Costo"]}>
            {[...byUser].sort((x, y) => y[1].cost - x[1].cost).map(([uid, u]) => (
              <tr key={uid}><Td>{names[uid] ?? (u.role === "nutriologo" ? "Nutriólogo" : uid.slice(0, 8))}</Td><Td>{u.calls}</Td><Td>{u.tokens.toLocaleString("es-MX")}</Td><Td>${u.cost.toFixed(3)}</Td></tr>
            ))}
          </Table>
        </Card>
        <Card title="Conversaciones recientes (auditoría)">
          <ul className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
            {recent.data?.map((m, i) => (
              <li key={i} className="py-1.5">
                <p className="text-xs text-muted">{fmtDateTime(m.created_at)} · {names[m.user_id] ?? "Nutriólogo"} · {m.role}{m.blocked_reason ? ` · bloqueado: ${m.blocked_reason}` : ""}</p>
                <p className="line-clamp-2">{m.content}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
