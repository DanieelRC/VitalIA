import Link from "next/link";
import { Badge, Button, Card, Empty, fmtDate, Input, PageHeader, Stat, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { listPayments } from "@/lib/admin-payments";
import { CFDI_STATUS } from "@/lib/billing/map";
import { mxn } from "@/lib/payments";
import { RetryButton } from "./retry-button";
import { Download } from "lucide-react";

export const metadata = { title: "Pagos y facturas" };

export default async function Payments({ searchParams }: { searchParams: Promise<{ mes?: string; cfdi?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const rows = await listPayments(sp.mes, sp.cfdi === "problemas");
  const total = rows.reduce((a, r) => a + r.amount_mxn, 0);
  const iva = total - total / 1.16;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Pagos y facturas" subtitle="Todos los cobros de suscripciones y su CFDI"
        actions={<a href={`/api/admin/export/pagos${qs ? `?${qs}` : ""}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Download className="size-4" />CSV para el contador</a>} />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Cobrado" value={mxn(total)} hint={`${rows.length} pago${rows.length === 1 ? "" : "s"}`} />
          <Stat label="Subtotal" value={mxn(total - iva)} />
          <Stat label="IVA trasladado (16%)" value={mxn(iva)} />
          <Stat label="Sin factura" value={rows.filter((r) => r.cfdi_status !== "timbrada").length} />
        </div>
        <Card>
          <form className="mb-4 flex flex-wrap items-end gap-2">
            <label className="text-sm">Mes <Input type="month" name="mes" defaultValue={sp.mes} className="mt-1" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="cfdi" value="problemas" defaultChecked={sp.cfdi === "problemas"} /> Solo facturas pendientes</label>
            <Button type="submit" variant="secondary" size="sm">Filtrar</Button>
          </form>
          {!rows.length ? <Empty>No hay pagos con esos filtros.</Empty> : (
            <Table head={["Fecha", "Consultorio", "Concepto", "Importe", "Factura", ""]}>
              {rows.map((r) => {
                const cs = CFDI_STATUS[r.cfdi_status] ?? CFDI_STATUS.pendiente;
                return (
                  <tr key={r.id} className="border-t border-border">
                    <Td className="whitespace-nowrap">{fmtDate(r.paid_at)}</Td>
                    <Td><Link href={`/admin/consultorios/${r.clinic_id}`} className="font-semibold hover:underline">{r.clinics?.name ?? "—"}</Link></Td>
                    <Td className="text-xs">{r.description}</Td>
                    <Td className="tabular-nums">{mxn(r.amount_mxn)}</Td>
                    <Td><Badge tone={cs.tone}>{cs.label}</Badge>{r.cfdi_error && r.cfdi_status === "error" && <span className="mt-1 block max-w-56 text-xs text-danger">{r.cfdi_error}</span>}</Td>
                    <Td className="text-right">{r.cfdi_status !== "timbrada" && <RetryButton id={r.id} />}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
