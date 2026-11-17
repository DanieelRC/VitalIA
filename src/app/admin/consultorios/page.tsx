import Link from "next/link";
import { Badge, Button, Card, Empty, fmtDate, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { clinicLabel, requireAdmin } from "@/lib/admin";
import { FILTERS, listClinics } from "@/lib/admin-clinics";
import { mxn } from "@/lib/payments";
import { Download } from "lucide-react";

export const metadata = { title: "Nutriólogos" };

export default async function Clinics({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; plan?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const rows = await listClinics(sp.q, sp.estado, sp.plan);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Nutriólogos" subtitle={`${rows.length} consultorio${rows.length === 1 ? "" : "s"}`}
        actions={<a href={`/api/admin/export/consultorios${qs ? `?${qs}` : ""}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Download className="size-4" />Exportar CSV</a>} />
      <Card>
        <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <Input name="q" defaultValue={sp.q} placeholder="Buscar por consultorio, nombre o correo" aria-label="Buscar" />
          <Select name="estado" defaultValue={sp.estado ?? ""} aria-label="Estado">
            <option value="">Todos los estados</option>
            {Object.entries(FILTERS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
          </Select>
          <Select name="plan" defaultValue={sp.plan ?? ""} aria-label="Plan">
            <option value="">Todos los planes</option>
            <option value="p5">Inicio</option><option value="p10">Crecimiento</option><option value="p20">Profesional</option><option value="pmax">Ilimitado</option>
          </Select>
          <Button type="submit" variant="secondary">Filtrar</Button>
        </form>
        {!rows.length ? <Empty>No hay consultorios con esos filtros.</Empty> : (
          <Table head={["Consultorio", "Estado", "Plan", "Pacientes", "IA del mes", "Cobrado", "Último acceso", "Alta"]}>
            {rows.map((c) => {
              const st = clinicLabel(c);
              const until = c.status === "prueba" ? c.trial_ends_at : c.in_comp ? c.comp_until : c.current_period_end;
              return (
                <tr key={c.id} className="border-t border-border">
                  <Td>
                    <Link href={`/admin/consultorios/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>
                    <span className="block text-xs text-muted">{c.owner_name ?? "—"} · {c.owner_email}{!c.email_confirmed_at && " · sin confirmar"}</span>
                  </Td>
                  <Td><Badge tone={st.tone}>{st.label}</Badge>{until && <span className="mt-1 block text-xs text-muted">hasta {fmtDate(until)}</span>}{c.payment_failed_at && <span className="mt-1 block text-xs text-danger">Cobro rechazado</span>}</Td>
                  <Td>{c.plan_name}</Td>
                  <Td className="tabular-nums">{c.active_patients}{c.total_patients > c.active_patients && <span className="text-xs text-muted"> / {c.total_patients}</span>}</Td>
                  <Td className="tabular-nums">${c.ai_cost_month.toFixed(2)}</Td>
                  <Td className="tabular-nums">{mxn(c.revenue_total)}</Td>
                  <Td className="whitespace-nowrap text-xs">{c.last_sign_in_at ? fmtDate(c.last_sign_in_at) : "Nunca"}</Td>
                  <Td className="whitespace-nowrap text-xs">{fmtDate(c.created_at)}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
