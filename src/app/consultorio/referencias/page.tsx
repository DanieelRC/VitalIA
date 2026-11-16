import { Card, PageHeader, Table, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Tablas de referencia" };

export default async function References() {
  const supabase = await createClient();
  const { data } = await supabase.from("reference_tables").select("*").order("sort");
  return (
    <>
      <PageHeader title="Tablas de referencia" subtitle="Puntos de corte y referencias clínicas." />
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.map((t) => (
          <Card key={t.id} title={t.title} actions={<span className="text-xs text-muted">{t.source}</span>}>
            <Table head={t.columns}>
              {(t.rows as string[][]).map((r, i) => <tr key={i}>{r.map((c, j) => <Td key={j}>{c}</Td>)}</tr>)}
            </Table>
          </Card>
        ))}
      </div>
    </>
  );
}
