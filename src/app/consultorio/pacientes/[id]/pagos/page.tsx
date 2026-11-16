import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionForm, ConfirmButton, SubmitButton, type FormState } from "@/components/form";
import { Badge, Card, Empty, Field, fmtDate, Input, Select, Stat, Table, Td } from "@/components/ui";
import { KINDS, METHODS, mxn, packageBalance, totalPaid, type Payment } from "@/lib/payments";
import { createClient, requireRole } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/time";

async function addPayment(patientId: string, _: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireRole("nutriologo");
  const d = z.object({
    paid_on: z.iso.date(),
    kind: z.enum(["consulta", "paquete", "otro"]),
    concept: z.string().trim().min(1, "Escribe el concepto").max(200),
    amount: z.preprocess((v) => Number(String(v ?? "").replace(",", ".")), z.number().min(0).max(1000000)),
    method: z.enum(["efectivo", "transferencia", "tarjeta", "paquete"]),
    sessions: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(100).nullable()),
  }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };
  const v = d.data;
  if (v.kind === "paquete" && !v.sessions) return { error: "Indica cuántas sesiones incluye el paquete." };
  if (v.method === "paquete" && v.kind !== "consulta") return { error: "“Con paquete” solo aplica a consultas." };

  const supabase = await createClient();
  if (v.method === "paquete") {
    const { data: all } = await supabase.from("payments").select("kind, method, amount, sessions").eq("patient_id", patientId);
    if (packageBalance((all ?? []) as Payment[]).left <= 0) return { error: "El paciente no tiene sesiones de paquete disponibles." };
  }
  const { error } = await supabase.from("payments").insert({
    patient_id: patientId, ...v, amount: v.method === "paquete" ? 0 : v.amount, sessions: v.kind === "paquete" ? v.sessions : null,
  });
  if (error) return { error: "No se pudo registrar el pago." };
  revalidatePath(`/consultorio/pacientes/${patientId}/pagos`);
  return { ok: "Pago registrado." };
}

async function removePayment(patientId: string, id: string) {
  "use server";
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from("payments").delete().eq("id", id).eq("patient_id", patientId);
  revalidatePath(`/consultorio/pacientes/${patientId}/pagos`);
}

export default async function PatientPayments({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("id, folio, paid_on, kind, concept, amount, method, sessions").eq("patient_id", id).order("paid_on", { ascending: false }).order("folio", { ascending: false });
  const rows = data ?? [];
  const bal = packageBalance(rows as Payment[]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px] xl:items-start">
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Total pagado" value={mxn(totalPaid(rows as Payment[]))} hint={`${rows.length} movimiento${rows.length === 1 ? "" : "s"}`} />
          <Stat label="Sesiones de paquete" value={bal.bought ? `${bal.left} disponibles` : "Sin paquete"} hint={bal.bought ? `${bal.used} usadas de ${bal.bought}` : undefined} />
        </div>
        <Card title="Movimientos">
          {rows.length ? (
            <Table head={["Folio", "Fecha", "Concepto", "Forma", "Importe", ""]}>
              {rows.map((p) => (
                <tr key={p.id}>
                  <Td className="text-muted">{String(p.folio).padStart(5, "0")}</Td>
                  <Td>{fmtDate(p.paid_on)}</Td>
                  <Td>{p.concept} <Badge tone={p.kind === "paquete" ? "info" : "neutral"}>{KINDS[p.kind]}{p.sessions ? ` · ${p.sessions} sesiones` : ""}</Badge></Td>
                  <Td>{METHODS[p.method]}</Td>
                  <Td className="font-semibold">{mxn(Number(p.amount))}</Td>
                  <Td className="flex items-center gap-2">
                    <a className="text-sm text-primary" href={`/api/pdf/recibo/${p.id}`} target="_blank" rel="noopener noreferrer">Recibo</a>
                    <form action={removePayment.bind(null, id, p.id)}><ConfirmButton message="¿Eliminar este movimiento?">Eliminar</ConfirmButton></form>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : <Empty>Sin pagos registrados.</Empty>}
          <p className="mt-3 text-xs text-muted">Los recibos son comprobantes internos, no facturas fiscales (CFDI). El paciente no ve esta sección.</p>
        </Card>
      </div>

      <Card title="Registrar pago">
        <ActionForm action={addPayment.bind(null, id)} resetOnOk className="grid grid-cols-2 gap-3">
          <Field label="Fecha"><Input type="date" name="paid_on" defaultValue={todayLocal()} required /></Field>
          <Field label="Tipo"><Select name="kind">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Concepto" className="col-span-2"><Input name="concept" defaultValue="Consulta de nutrición" maxLength={200} required /></Field>
          <Field label="Importe (MXN)"><Input name="amount" inputMode="decimal" defaultValue="0" required /></Field>
          <Field label="Forma de pago"><Select name="method">{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Sesiones del paquete" hint="Solo para tipo Paquete" className="col-span-2"><Input name="sessions" inputMode="numeric" placeholder="Ej. 4" /></Field>
          <div className="col-span-2"><SubmitButton>Registrar</SubmitButton></div>
        </ActionForm>
        <p className="mt-3 text-xs text-muted">Para descontar una sesión de un paquete: tipo Consulta y forma “Con paquete”.</p>
      </Card>
    </div>
  );
}
