import Link from "next/link";
import { Card, Empty, fmtDate, Input, PageHeader, Stat, Table, Td, Button } from "@/components/ui";
import { KINDS, METHODS, mxn } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/time";

export const metadata = { title: "Pagos" };

export default async function Payments({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(mes ?? "") ? mes! : todayLocal().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // primer día del mes siguiente
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("id, folio, paid_on, kind, concept, amount, method, patient_id, patients(full_name)")
    .gte("paid_on", from).lt("paid_on", to).order("paid_on", { ascending: false }).order("folio", { ascending: false });
  const rows = data ?? [];
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  const byMethod = Object.keys(METHODS).filter((k) => k !== "paquete").map((k) => ({ k, sum: rows.filter((r) => r.method === k).reduce((a, r) => a + Number(r.amount), 0) }));
  const title = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));

  return (
    <>
      <PageHeader title="Pagos" subtitle={<span className="first-letter:uppercase">Ingresos de {title}</span>}
        actions={<form className="flex items-center gap-2"><Input type="month" name="mes" defaultValue={month} aria-label="Mes" className="w-44" /><Button type="submit" variant="secondary">Ver mes</Button></form>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total del mes" value={mxn(total)} hint={`${rows.length} movimiento${rows.length === 1 ? "" : "s"}`} />
        {byMethod.map((b) => <Stat key={b.k} label={METHODS[b.k]} value={mxn(b.sum)} />)}
      </div>
      <Card className="mt-4" title="Movimientos">
        {rows.length ? (
          <Table head={["Folio", "Fecha", "Paciente", "Concepto", "Forma", "Importe", ""]}>
            {rows.map((p) => (
              <tr key={p.id}>
                <Td className="text-muted">{String(p.folio).padStart(5, "0")}</Td>
                <Td>{fmtDate(p.paid_on)}</Td>
                <Td><Link className="font-medium text-primary" href={`/consultorio/pacientes/${p.patient_id}/pagos`}>{(p.patients as unknown as { full_name: string } | null)?.full_name}</Link></Td>
                <Td>{p.concept} <span className="text-xs text-muted">· {KINDS[p.kind]}</span></Td>
                <Td>{METHODS[p.method]}</Td>
                <Td className="font-semibold">{mxn(Number(p.amount))}</Td>
                <Td><a className="text-sm text-primary" href={`/api/pdf/recibo/${p.id}`} target="_blank" rel="noopener noreferrer">Recibo</a></Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>Sin pagos en este mes. Se registran desde la pestaña Pagos de cada paciente.</Empty>}
      </Card>
    </>
  );
}
