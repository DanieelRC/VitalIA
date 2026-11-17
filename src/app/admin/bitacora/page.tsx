import Link from "next/link";
import { Button, Card, Empty, fmtDateTime, PageHeader, Select, Table, Td } from "@/components/ui";
import { ADMIN_ACTIONS, requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Bitácora" };

export default async function AuditLog({ searchParams }: { searchParams: Promise<{ accion?: string }> }) {
  await requireAdmin();
  const { accion } = await searchParams;
  const admin = createAdminClient();
  let q = admin.from("admin_actions").select("id, admin_id, clinic_id, action, reason, at").order("at", { ascending: false }).limit(300);
  if (accion && ADMIN_ACTIONS[accion]) q = q.eq("action", accion);
  const { data: rows } = await q;
  const clinicIds = [...new Set((rows ?? []).map((r) => r.clinic_id).filter(Boolean))] as string[];
  const adminIds = [...new Set((rows ?? []).map((r) => r.admin_id).filter(Boolean))] as string[];
  const [{ data: clinics }, admins] = await Promise.all([
    clinicIds.length ? admin.from("clinics").select("id, name").in("id", clinicIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    Promise.all(adminIds.map(async (id) => [id, (await admin.auth.admin.getUserById(id)).data.user?.email ?? id] as const)),
  ]);
  const clinicName = new Map((clinics ?? []).map((c) => [c.id, c.name]));
  const adminEmail = new Map(admins);

  return (
    <>
      <PageHeader title="Bitácora" subtitle="Cada acción del panel, con su motivo. No se puede editar ni borrar." />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <Select name="accion" defaultValue={accion ?? ""} aria-label="Acción">
            <option value="">Todas las acciones</option>
            {Object.entries(ADMIN_ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Button type="submit" variant="secondary" size="sm">Filtrar</Button>
        </form>
        {!rows?.length ? <Empty>Sin acciones registradas.</Empty> : (
          <Table head={["Fecha", "Acción", "Consultorio", "Motivo", "Por"]}>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.at)}</Td>
                <Td className="font-semibold">{ADMIN_ACTIONS[r.action] ?? r.action}</Td>
                <Td>{r.clinic_id ? <Link href={`/admin/consultorios/${r.clinic_id}`} className="hover:underline">{clinicName.get(r.clinic_id) ?? "(eliminado)"}</Link> : "Plataforma"}</Td>
                <Td className="text-sm">{r.reason}</Td>
                <Td className="text-xs text-muted">{r.admin_id ? adminEmail.get(r.admin_id) : "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
