import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { Badge, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { deleteRow, saveSupplement } from "../catalog-actions";

export const metadata = { title: "Suplementos" };

export default async function Supplements() {
  const supabase = await createClient();
  const { data } = await supabase.from("supplements").select("*").order("category").order("name");
  return (
    <>
      <PageHeader title="Suplementos alimenticios" subtitle="Nivel de evidencia: A fuerte · B moderada · C limitada." />
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        {data?.map((s) => (
          <Card key={s.id} title={<>{s.name} {s.evidence && <Badge tone={s.evidence === "A" ? "primary" : s.evidence === "B" ? "info" : "warn"}>Evidencia {s.evidence}</Badge>}</>}
            actions={!s.is_base && <form action={async () => { "use server"; await deleteRow("supplements", s.id, "/consultorio/suplementos"); }}><ConfirmButton message="¿Eliminar suplemento?">Eliminar</ConfirmButton></form>}>
            <dl className="grid gap-1 text-sm">
              <div><dt className="inline text-muted">Categoría: </dt><dd className="inline">{s.category} · {s.presentation}</dd></div>
              <div><dt className="inline text-muted">Dosis habitual: </dt><dd className="inline">{s.typical_dose}</dd></div>
              <div><dt className="inline text-muted">Indicaciones: </dt><dd className="inline">{s.indications}</dd></div>
              <div><dt className="inline text-muted">Contraindicaciones: </dt><dd className="inline">{s.contraindications}</dd></div>
              {s.interactions && <div><dt className="inline text-muted">Interacciones: </dt><dd className="inline">{s.interactions}</dd></div>}
            </dl>
          </Card>
        ))}
      </div>
      <Card title="Agregar suplemento">
        <ActionForm action={saveSupplement} resetOnOk className="grid gap-3 sm:grid-cols-3">
          <Field label="Nombre"><Input name="name" required /></Field>
          <Field label="Categoría"><Input name="category" /></Field>
          <Field label="Presentación"><Input name="presentation" /></Field>
          <Field label="Dosis habitual"><Input name="typical_dose" /></Field>
          <Field label="Evidencia"><Select name="evidence"><option value="">—</option><option>A</option><option>B</option><option>C</option></Select></Field>
          <Field label="Interacciones"><Input name="interactions" /></Field>
          <Field label="Indicaciones" className="sm:col-span-3"><Textarea name="indications" rows={2} /></Field>
          <Field label="Contraindicaciones" className="sm:col-span-3"><Textarea name="contraindications" rows={2} /></Field>
          <div><SubmitButton size="sm">Agregar</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
