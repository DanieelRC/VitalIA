import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { Badge, Card, Empty, Field, Input, PageHeader, Select, Table, Td, fmtNum } from "@/components/ui";
import { getGroups, groupLabel } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { deleteRow, saveFood } from "../catalog-actions";
import { GroupDot } from "@/components/plate";

export const metadata = { title: "Alimentos" };

export default async function Foods({ searchParams }: { searchParams: Promise<{ q?: string; g?: string }> }) {
  const { q, g } = await searchParams;
  const supabase = await createClient();
  const groups = await getGroups();
  let query = supabase.from("foods").select("*").order("name").limit(300);
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  if (g) query = query.eq("group_code", g);
  const { data } = await query;
  const gmap = Object.fromEntries(groups.map((x) => [x.code, x]));

  return (
    <>
      <PageHeader title="Listado de alimentos" subtitle="Valores por porción equivalente (SMAE). Los alimentos base no se editan." />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Buscar alimento" className="max-w-xs" />
        <Select name="g" defaultValue={g ?? ""} className="max-w-xs">
          <option value="">Todos los grupos</option>
          {groups.map((x) => <option key={x.code} value={x.code}>{groupLabel(x)}</option>)}
        </Select>
        <button className="h-10 rounded-lg border border-border px-4 text-sm">Filtrar</button>
      </form>
      <Card className="mb-4">
        {data?.length ? (
          <Table head={["Alimento", "Grupo", "Porción", "g", "kcal", "P", "L", "HC", "Fibra", ""]}>
            {data.map((f) => (
              <tr key={f.id}>
                <Td className="font-medium">{f.name} {!f.is_base && <Badge tone="info">propio</Badge>}</Td>
                <Td className="text-muted">{f.group_code ? <span className="flex items-center gap-2"><GroupDot code={f.group_code} />{groupLabel(gmap[f.group_code])}</span> : "—"}</Td>
                <Td>{f.portion}</Td><Td>{fmtNum(f.portion_g, 0)}</Td><Td>{fmtNum(f.kcal, 0)}</Td>
                <Td>{fmtNum(f.protein_g)}</Td><Td>{fmtNum(f.fat_g)}</Td><Td>{fmtNum(f.carbs_g)}</Td><Td>{fmtNum(f.fiber_g)}</Td>
                <Td>{!f.is_base && <form action={async () => { "use server"; await deleteRow("foods", f.id, "/consultorio/alimentos"); }}><ConfirmButton message="¿Eliminar alimento?">Eliminar</ConfirmButton></form>}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>Sin resultados.</Empty>}
      </Card>
      <Card title="Agregar alimento propio">
        <ActionForm action={saveFood} resetOnOk className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="Nombre" className="col-span-2"><Input name="name" required /></Field>
          <Field label="Grupo SMAE" className="col-span-2">
            <Select name="group_code"><option value="">Sin grupo</option>{groups.map((x) => <option key={x.code} value={x.code}>{groupLabel(x)}</option>)}</Select>
          </Field>
          <Field label="Porción"><Input name="portion" placeholder="1 taza" required /></Field>
          <Field label="Peso neto (g)"><Input name="portion_g" inputMode="decimal" /></Field>
          <Field label="kcal"><Input name="kcal" inputMode="decimal" /></Field>
          <Field label="Proteína (g)"><Input name="protein_g" inputMode="decimal" /></Field>
          <Field label="Lípidos (g)"><Input name="fat_g" inputMode="decimal" /></Field>
          <Field label="Hidratos (g)"><Input name="carbs_g" inputMode="decimal" /></Field>
          <Field label="Fibra (g)"><Input name="fiber_g" inputMode="decimal" /></Field>
          <Field label="Sodio (mg)"><Input name="sodium_mg" inputMode="decimal" /></Field>
          <div className="col-span-2 flex items-end sm:col-span-5"><SubmitButton size="sm">Agregar</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
