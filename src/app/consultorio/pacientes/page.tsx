import Link from "next/link";
import { Badge, Empty, fmtDate, Input, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ageFromBirthDate } from "@/lib/nutrition";

export const metadata = { title: "Pacientes" };

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; inactivos?: string }> }) {
  const { q, inactivos } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("patients").select("id, full_name, email, birth_date, sex, pathologies, user_id, active, created_at").order("full_name");
  if (!inactivos) query = query.eq("active", true);
  if (q) query = query.ilike("full_name", `%${q.replace(/[%_]/g, "")}%`);
  const { data } = await query;

  return (
    <>
      <PageHeader title="Pacientes" actions={<LinkButton href="/consultorio/pacientes/nuevo" variant="primary">Nuevo paciente</LinkButton>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Buscar por nombre" className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="inactivos" defaultChecked={!!inactivos} /> Incluir inactivos</label>
      </form>
      {data?.length ? (
        <Table head={["Nombre", "Edad", "Patologías", "Cuenta", "Alta"]}>
          {data.map((p) => (
            <tr key={p.id}>
              <Td><Link className="font-medium text-primary" href={`/consultorio/pacientes/${p.id}`}>{p.full_name}</Link><div className="text-xs text-muted">{p.email}</div></Td>
              <Td>{p.birth_date ? `${ageFromBirthDate(p.birth_date)} años` : "—"} {p.sex ?? ""}</Td>
              <Td className="max-w-56">{p.pathologies.join(", ") || "—"}</Td>
              <Td>{p.user_id ? <Badge tone="primary">Activa</Badge> : <Badge tone="warn">Invitación pendiente</Badge>}</Td>
              <Td>{fmtDate(p.created_at)}</Td>
            </tr>
          ))}
        </Table>
      ) : <Empty>No hay pacientes{q ? " con ese nombre" : ""}.</Empty>}
    </>
  );
}
