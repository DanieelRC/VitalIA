import { Card, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { getGroups, groupLabel } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { GroupDot } from "@/components/plate";

export const metadata = { title: "Tabla de equivalentes" };

export default async function Equivalents() {
  const supabase = await createClient();
  const groups = await getGroups();
  const { data: foods } = await supabase.from("foods").select("name, portion, portion_g, group_code").not("group_code", "is", null).order("name");

  return (
    <>
      <PageHeader title="Sistema Mexicano de Alimentos Equivalentes" subtitle="Aporte promedio por equivalente." actions={<LinkButton href="/consultorio/personalizar" size="sm">Ajustar aportes y crear grupos</LinkButton>} />
      <Card className="mb-4">
        <Table head={["Grupo", "kcal", "Proteína (g)", "Lípidos (g)", "Hidratos (g)"]}>
          {groups.map((g) => (
            <tr key={g.code}><Td className="font-medium"><span className="flex items-center gap-2"><GroupDot code={g.code} />{groupLabel(g)}</span></Td><Td>{g.kcal}</Td><Td>{g.protein_g}</Td><Td>{g.fat_g}</Td><Td>{g.carbs_g}</Td></tr>
          ))}
        </Table>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => {
          const list = (foods ?? []).filter((f) => f.group_code === g.code);
          if (!list.length) return null;
          return (
            <Card key={g.code} title={<span className="flex items-center gap-2"><GroupDot code={g.code} className="size-3" />{groupLabel(g)}</span>}>
              <ul className="divide-y divide-border text-sm">
                {list.map((f) => (
                  <li key={f.name} className="flex justify-between gap-2 py-1.5"><span>{f.name}</span><span className="text-muted">{f.portion}{f.portion_g ? ` · ${f.portion_g} g` : ""}</span></li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
