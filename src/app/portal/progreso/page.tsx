import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionForm, ConfirmButton, SubmitButton, type FormState } from "@/components/form";
import { ProgressChart } from "@/components/progress-chart";
import { Card, Empty, Field, fmtDate, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { createClient, requireRole } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/time";

export const metadata = { title: "Mi progreso" };

const num = z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(",", "."))), z.number().positive().max(500).nullable());

async function addLog(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const s = await requireRole("paciente");
  const d = z.object({
    logged_at: z.iso.date(), weight_kg: num, waist_cm: num, hip_cm: num,
    adherence: z.preprocess((v) => (v ? Number(v) : null), z.number().int().min(1).max(5).nullable()),
    exercise_minutes: z.preprocess((v) => (v ? Number(v) : null), z.number().int().min(0).max(1440).nullable()),
    notes: z.string().max(2000).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: "Revisa los valores." };
  if (!d.data.weight_kg && !d.data.waist_cm && !d.data.adherence && !d.data.notes) return { error: "Registra al menos un dato." };
  const supabase = await createClient();
  const { error } = await supabase.from("progress_logs").insert({ ...d.data, notes: d.data.notes || null, patient_id: s.patientId });
  if (error) return { error: error.message };
  revalidatePath("/portal/progreso");
  return { ok: "¡Registro guardado!" };
}

async function removeLog(id: string) {
  "use server";
  await requireRole("paciente");
  const supabase = await createClient();
  await supabase.from("progress_logs").delete().eq("id", id);
  revalidatePath("/portal/progreso");
}

export default async function MyProgress() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const [logs, anthro] = await Promise.all([
    supabase.from("progress_logs").select("*").eq("patient_id", s.patientId!).order("logged_at", { ascending: false }).limit(200),
    supabase.from("my_anthropometry").select("measured_at, weight_kg, results").eq("patient_id", s.patientId!).order("measured_at"),
  ]);
  const rows = logs.data ?? [];
  const chart = [
    ...(anthro.data ?? []).map((a) => ({ t: a.measured_at, date: fmtDate(a.measured_at, { day: "2-digit", month: "short" }), consulta: a.weight_kg, casa: null })),
    ...rows.map((r) => ({ t: r.logged_at, date: fmtDate(r.logged_at, { day: "2-digit", month: "short" }), consulta: null, casa: r.weight_kg })),
  ].sort((a, b) => a.t.localeCompare(b.t));

  return (
    <>
      <PageHeader title="Mi progreso" />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card title="Evolución de peso">
          <ProgressChart data={chart} series={[{ key: "consulta", label: "En consulta" }, { key: "casa", label: "Registro en casa" }]} />
        </Card>
        <Card title="Nuevo registro">
          <ActionForm action={addLog} resetOnOk className="grid grid-cols-2 gap-3">
            <Field label="Fecha" className="col-span-2"><Input type="date" name="logged_at" defaultValue={todayLocal()} /></Field>
            <Field label="Peso (kg)"><Input name="weight_kg" inputMode="decimal" /></Field>
            <Field label="Cintura (cm)"><Input name="waist_cm" inputMode="decimal" /></Field>
            <Field label="Cadera (cm)"><Input name="hip_cm" inputMode="decimal" /></Field>
            <Field label="Ejercicio (min)"><Input name="exercise_minutes" inputMode="numeric" /></Field>
            <Field label="¿Cómo te fue con tu plan?" className="col-span-2">
              <Select name="adherence" defaultValue=""><option value="">—</option><option value="5">Excelente</option><option value="4">Bien</option><option value="3">Regular</option><option value="2">Difícil</option><option value="1">Muy difícil</option></Select>
            </Field>
            <Field label="Comentarios" className="col-span-2"><Textarea name="notes" rows={2} /></Field>
            <div><SubmitButton size="sm">Guardar</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
      <Card className="mt-4" title="Mis registros">
        {rows.length ? (
          <Table head={["Fecha", "Peso", "Cintura", "Cadera", "Ejercicio", "Plan", ""]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>{fmtDate(r.logged_at)}</Td><Td>{r.weight_kg ?? "—"}</Td><Td>{r.waist_cm ?? "—"}</Td><Td>{r.hip_cm ?? "—"}</Td>
                <Td>{r.exercise_minutes ? `${r.exercise_minutes} min` : "—"}</Td><Td>{r.adherence ? `${r.adherence}/5` : "—"}</Td>
                <Td><form action={removeLog.bind(null, r.id)}><ConfirmButton message="¿Eliminar registro?">Eliminar</ConfirmButton></form></Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>Aún no tienes registros.</Empty>}
      </Card>
    </>
  );
}
