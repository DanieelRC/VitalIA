import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionForm, ConfirmButton, SubmitButton, type FormState } from "@/components/form";
import { Badge, Button, Card, Empty, Field, fmtDate, Input, PageHeader, Select } from "@/components/ui";
import { createClient, requireRole } from "@/lib/supabase/server";
import { localToISO } from "@/lib/time";

export const metadata = { title: "Agenda" };
const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const tone = { solicitada: "warn", confirmada: "primary", cancelada: "neutral", completada: "info" } as const;

async function setStatus(id: string, status: string) {
  "use server";
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from("appointments").update({ status }).eq("id", id);
  revalidatePath("/consultorio/agenda");
}

async function createAppointment(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireRole("nutriologo");
  const d = z.object({ patient_id: z.uuid(), starts_at: z.string().min(16), minutes: z.coerce.number().int().min(15).max(240), reason: z.string().max(300).optional() })
    .safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: "Elige paciente, fecha y duración." };
  const start = localToISO(d.data.starts_at);
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").insert({
    patient_id: d.data.patient_id, starts_at: start, ends_at: new Date(new Date(start).getTime() + d.data.minutes * 60e3).toISOString(),
    status: "confirmada", reason: d.data.reason || null,
  });
  if (error) return { error: error.code === "23P01" ? "Ese horario se empalma con otra cita." : error.message };
  revalidatePath("/consultorio/agenda");
  return { ok: "Cita agendada." };
}

async function addAvailability(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireRole("nutriologo");
  const d = z.object({ weekday: z.coerce.number().int().min(0).max(6), start_time: z.string(), end_time: z.string(), slot_minutes: z.coerce.number().int().min(15).max(240) })
    .safeParse(Object.fromEntries(fd));
  if (!d.success || d.data.start_time >= d.data.end_time) return { error: "Horario inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("availability").insert(d.data);
  if (error) return { error: error.message };
  revalidatePath("/consultorio/agenda");
  return { ok: "Horario agregado." };
}

async function removeAvailability(id: string) {
  "use server";
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from("availability").delete().eq("id", id);
  revalidatePath("/consultorio/agenda");
}

export default async function Agenda() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [appts, avail, patients] = await Promise.all([
    supabase.from("appointments").select("*, patients(full_name)").gte("starts_at", since).order("starts_at"),
    supabase.from("availability").select("*").order("weekday").order("start_time"),
    supabase.from("patients").select("id, full_name").eq("active", true).order("full_name"),
  ]);
  const byDay = new Map<string, NonNullable<typeof appts.data>>();
  for (const a of appts.data ?? []) {
    const k = fmtDate(a.starts_at, { dateStyle: "full" });
    byDay.set(k, [...(byDay.get(k) ?? []), a]);
  }

  return (
    <>
      <PageHeader title="Agenda" />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card title="Citas">
          {byDay.size ? [...byDay].map(([day, list]) => (
            <div key={day} className="mb-4">
              <h3 className="mb-1 text-sm font-semibold capitalize">{day}</h3>
              <ul className="divide-y divide-border text-sm">
                {list.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <strong>{fmtDate(a.starts_at, { timeStyle: "short" })}</strong> · {(a.patients as { full_name: string } | null)?.full_name}
                      {a.reason && <span className="text-muted"> · {a.reason}</span>}
                    </span>
                    <span className="flex items-center gap-1">
                      <Badge tone={tone[a.status as keyof typeof tone]}>{a.status}</Badge>
                      {a.status === "solicitada" && <form action={setStatus.bind(null, a.id, "confirmada")}><Button size="sm" variant="secondary">Confirmar</Button></form>}
                      {["solicitada", "confirmada"].includes(a.status) && <form action={setStatus.bind(null, a.id, "completada")}><Button size="sm" variant="ghost">Completada</Button></form>}
                      {a.status !== "cancelada" && <form action={setStatus.bind(null, a.id, "cancelada")}><ConfirmButton message="¿Cancelar la cita?">Cancelar</ConfirmButton></form>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )) : <Empty>Sin citas.</Empty>}
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Agendar cita">
            <ActionForm action={createAppointment} resetOnOk className="grid gap-2">
              <Field label="Paciente"><Select name="patient_id" required defaultValue=""><option value="" disabled>Selecciona…</option>{patients.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></Field>
              <Field label="Fecha y hora"><Input type="datetime-local" name="starts_at" required /></Field>
              <Field label="Duración (min)"><Input name="minutes" type="number" defaultValue={60} /></Field>
              <Field label="Motivo"><Input name="reason" /></Field>
              <div><SubmitButton size="sm">Agendar</SubmitButton></div>
            </ActionForm>
          </Card>
          <Card title="Horario de atención">
            <ul className="mb-3 text-sm">
              {avail.data?.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-1">
                  <span>{DAYS[a.weekday]} {a.start_time.slice(0, 5)}–{a.end_time.slice(0, 5)} · {a.slot_minutes} min</span>
                  <form action={removeAvailability.bind(null, a.id)}><ConfirmButton message="¿Quitar horario?">Quitar</ConfirmButton></form>
                </li>
              ))}
            </ul>
            <ActionForm action={addAvailability} className="grid grid-cols-2 gap-2">
              <Field label="Día"><Select name="weekday">{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></Field>
              <Field label="Duración (min)"><Input name="slot_minutes" type="number" defaultValue={60} /></Field>
              <Field label="Desde"><Input name="start_time" type="time" defaultValue="09:00" /></Field>
              <Field label="Hasta"><Input name="end_time" type="time" defaultValue="14:00" /></Field>
              <div><SubmitButton size="sm" variant="secondary">Agregar</SubmitButton></div>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
