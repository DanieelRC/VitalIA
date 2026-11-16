import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionForm, ConfirmButton, SubmitButton, type FormState } from "@/components/form";
import { Badge, Card, Empty, Field, fmtDate, fmtDateTime, Input, PageHeader, Select } from "@/components/ui";
import { createClient, requireRole } from "@/lib/supabase/server";
import { freeSlots, type Availability } from "@/lib/slots";

export const metadata = { title: "Citas" };

async function book(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const s = await requireRole("paciente");
  const d = z.object({ slot: z.string().regex(/^\d{4}-.+\|.+$/), reason: z.string().max(300).optional() }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: "Elige un horario." };
  const [starts_at, ends_at] = d.data.slot.split("|");
  const supabase = await createClient();

  // Verifica que el horario siga disponible según la agenda
  const { data: avail } = await supabase.from("availability").select("*");
  const { data: busy } = await supabase.rpc("busy_slots", { p_from: starts_at, p_to: ends_at });
  const ok = freeSlots((avail ?? []) as Availability[], busy ?? [], 60).some((x) => x.start === new Date(starts_at).toISOString() && x.end === new Date(ends_at).toISOString());
  if (!ok) return { error: "Ese horario ya no está disponible." };

  const { count } = await supabase.from("appointments").select("id", { count: "exact", head: true })
    .eq("patient_id", s.patientId!).in("status", ["solicitada", "confirmada"]).gte("starts_at", new Date().toISOString());
  if ((count ?? 0) >= 2) return { error: "Ya tienes citas pendientes. Cancela una para agendar otra." };

  const { error } = await supabase.from("appointments").insert({ patient_id: s.patientId, starts_at, ends_at, reason: d.data.reason || null, status: "solicitada" });
  if (error) return { error: error.code === "23P01" ? "Ese horario acaba de ocuparse." : error.message };
  revalidatePath("/portal/citas");
  return { ok: "Cita solicitada. Tu nutriólogo la confirmará." };
}

async function cancel(id: string) {
  "use server";
  await requireRole("paciente");
  const supabase = await createClient();
  await supabase.rpc("cancel_my_appointment", { p_id: id });
  revalidatePath("/portal/citas");
}

export default async function PatientAppointments() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const now = new Date();
  const to = new Date(now.getTime() + 21 * 864e5);
  const [mine, avail, busy] = await Promise.all([
    supabase.from("appointments").select("*").eq("patient_id", s.patientId!).order("starts_at", { ascending: false }).limit(20),
    supabase.from("availability").select("*"),
    supabase.rpc("busy_slots", { p_from: now.toISOString(), p_to: to.toISOString() }),
  ]);
  const slots = freeSlots((avail.data ?? []) as Availability[], busy.data ?? []);
  const byDay = new Map<string, typeof slots>();
  for (const sl of slots) {
    const k = fmtDate(sl.start, { weekday: "long", day: "numeric", month: "long" });
    byDay.set(k, [...(byDay.get(k) ?? []), sl]);
  }

  return (
    <>
      <PageHeader title="Citas" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Agendar">
          {slots.length ? (
            <ActionForm action={book} className="grid gap-3">
              <Field label="Horario disponible">
                <Select name="slot" required defaultValue="">
                  <option value="" disabled>Elige…</option>
                  {[...byDay].map(([day, list]) => (
                    <optgroup key={day} label={day}>
                      {list.map((sl) => <option key={sl.start} value={`${sl.start}|${sl.end}`}>{fmtDate(sl.start, { timeStyle: "short" })}</option>)}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label="Motivo (opcional)"><Input name="reason" placeholder="Seguimiento, dudas del plan…" /></Field>
              <div><SubmitButton>Solicitar cita</SubmitButton></div>
            </ActionForm>
          ) : <Empty>No hay horarios disponibles en las próximas semanas. Escribe a tu nutriólogo.</Empty>}
        </Card>
        <Card title="Mis citas">
          {mine.data?.length ? (
            <ul className="divide-y divide-border text-sm">
              {mine.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{fmtDateTime(a.starts_at)} <Badge tone={a.status === "confirmada" ? "primary" : a.status === "solicitada" ? "warn" : "neutral"}>{a.status}</Badge></span>
                  {["solicitada", "confirmada"].includes(a.status) && new Date(a.starts_at) > now && (
                    <form action={cancel.bind(null, a.id)}><ConfirmButton message="¿Cancelar la cita?">Cancelar</ConfirmButton></form>
                  )}
                </li>
              ))}
            </ul>
          ) : <Empty>Sin citas.</Empty>}
        </Card>
      </div>
    </>
  );
}
