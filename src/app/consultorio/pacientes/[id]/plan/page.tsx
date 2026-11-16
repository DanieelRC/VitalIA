import Link from "next/link";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { Badge, Button, Card, Empty, Field, fmtDate, Input, LinkButton, Select, Table, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { applyTemplate, deletePlan, deleteTemplate, saveAsTemplate } from "./actions";

export default async function Plans({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data }, { data: templates }] = await Promise.all([
    supabase.from("meal_plans").select("id, name, status, kcal_target, macros, start_date, created_at").eq("patient_id", id).order("created_at", { ascending: false }),
    supabase.from("plan_templates").select("id, name, kcal_target, meals").order("name"),
  ]);

  return (
    <div className="grid gap-4">
      <Card title="Planes de alimentación" actions={<LinkButton size="sm" variant="primary" href={`/consultorio/pacientes/${id}/plan/nuevo`}>Nuevo plan</LinkButton>}>
        {data?.length ? (
          <Table head={["Plan", "Estado", "Energía", "P / L / HC (g)", "Inicio", ""]}>
            {data.map((p) => (
              <tr key={p.id}>
                <Td><Link className="font-medium text-primary" href={`/consultorio/pacientes/${id}/plan/${p.id}`}>{p.name}</Link></Td>
                <Td><Badge tone={p.status === "activo" ? "primary" : p.status === "borrador" ? "warn" : "neutral"}>{p.status}</Badge></Td>
                <Td>{p.kcal_target} kcal</Td>
                <Td>{Math.round(p.macros.protein_g)} / {Math.round(p.macros.fat_g)} / {Math.round(p.macros.carbs_g)}</Td>
                <Td>{fmtDate(p.start_date)}</Td>
                <Td className="flex flex-wrap items-center gap-2">
                  <a className="text-sm text-primary" href={`/api/pdf/plan/${p.id}`} target="_blank">PDF</a>
                  <form action={saveAsTemplate.bind(null, id, p.id)}><Button type="submit" variant="ghost" size="sm">Guardar como plantilla</Button></form>
                  <form action={async () => { "use server"; await deletePlan(id, p.id); }}><ConfirmButton message="¿Eliminar este plan?">Eliminar</ConfirmButton></form>
                </Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>Sin planes. Crea el primero a partir de la última antropometría o de una plantilla.</Empty>}
      </Card>

      <Card title="Crear desde una plantilla">
        {templates?.length ? (
          <div className="grid gap-5 lg:grid-cols-[360px_1fr] lg:items-start">
            <ActionForm action={applyTemplate.bind(null, id)} className="grid gap-3">
              <Field label="Plantilla">
                <Select name="template_id" required>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
              </Field>
              <Field label="Energía para este paciente (kcal)" hint="Vacío = la de la plantilla. Los equivalentes se escalan a medias porciones.">
                <Input name="kcal" inputMode="numeric" placeholder="Ej. 1600" />
              </Field>
              <div><SubmitButton pendingText="Creando…">Crear borrador</SubmitButton></div>
            </ActionForm>
            <ul className="divide-y divide-border text-sm">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <span><span className="font-medium">{t.name}</span> <span className="text-muted">· {(t.meals as unknown[]).length} tiempos</span></span>
                  <form action={deleteTemplate.bind(null, id, t.id)}><ConfirmButton message="¿Eliminar esta plantilla? Los planes ya creados no se afectan.">Eliminar</ConfirmButton></form>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="text-sm text-muted">Aún no tienes plantillas. Usa “Guardar como plantilla” en cualquier plan para reutilizarlo con otros pacientes.</p>}
        <p className="mt-3 text-xs text-muted">El plan se crea como borrador: revisa la adecuación en el editor antes de activarlo.</p>
      </Card>
    </div>
  );
}
