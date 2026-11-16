import { ActionForm, SubmitButton } from "@/components/form";
import { Badge, Button, Card, Empty, Field, Input, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { assignRoutine, assignSupplement, toggleAssignment } from "./actions";

export default async function Indicaciones({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [sups, routines, ps, pr] = await Promise.all([
    supabase.from("supplements").select("id, name, typical_dose").order("name"),
    supabase.from("routines").select("id, name, type, level").order("name"),
    supabase.from("patient_supplements").select("*, supplements(name, contraindications)").eq("patient_id", id).order("created_at", { ascending: false }),
    supabase.from("patient_routines").select("*, routines(name, type, level)").eq("patient_id", id).order("created_at", { ascending: false }),
  ]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Suplementación">
        <ActionForm action={assignSupplement.bind(null, id)} resetOnOk className="mb-4 grid gap-2">
          <Field label="Suplemento">
            <Select name="supplement_id" required defaultValue="">
              <option value="" disabled>Selecciona…</option>
              {sups.data?.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.typical_dose}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Dosis"><Input name="dose" /></Field>
            <Field label="Horario"><Input name="schedule" placeholder="Con el desayuno" /></Field>
          </div>
          <Field label="Indicaciones"><Input name="notes" /></Field>
          <div><SubmitButton size="sm">Indicar</SubmitButton></div>
        </ActionForm>
        {ps.data?.length ? (
          <ul className="divide-y divide-border text-sm">
            {ps.data.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">{a.supplements?.name} {!a.active && <Badge>Suspendido</Badge>}</p>
                  <p className="text-muted">{[a.dose, a.schedule, a.notes].filter(Boolean).join(" · ")}</p>
                  {a.supplements?.contraindications && <p className="text-xs text-warn">Contraindicaciones: {a.supplements.contraindications}</p>}
                </div>
                <form action={async () => { "use server"; await toggleAssignment(id, "patient_supplements", a.id, !a.active); }}>
                  <Button size="sm" variant="ghost">{a.active ? "Suspender" : "Reactivar"}</Button>
                </form>
              </li>
            ))}
          </ul>
        ) : <Empty>Sin suplementos indicados.</Empty>}
      </Card>

      <Card title="Rutinas de ejercicio">
        <ActionForm action={assignRoutine.bind(null, id)} resetOnOk className="mb-4 grid gap-2">
          <Field label="Rutina">
            <Select name="routine_id" required defaultValue="">
              <option value="" disabled>Selecciona…</option>
              {routines.data?.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.type} · {x.level}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Frecuencia"><Input name="frequency" placeholder="3 veces por semana" /></Field>
            <Field label="Indicaciones"><Input name="notes" /></Field>
          </div>
          <div><SubmitButton size="sm">Asignar</SubmitButton></div>
        </ActionForm>
        {pr.data?.length ? (
          <ul className="divide-y divide-border text-sm">
            {pr.data.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">{a.routines?.name} {!a.active && <Badge>Suspendida</Badge>}</p>
                  <p className="text-muted">{[a.routines?.type, a.frequency, a.notes].filter(Boolean).join(" · ")}</p>
                </div>
                <form action={async () => { "use server"; await toggleAssignment(id, "patient_routines", a.id, !a.active); }}>
                  <Button size="sm" variant="ghost">{a.active ? "Suspender" : "Reactivar"}</Button>
                </form>
              </li>
            ))}
          </ul>
        ) : <Empty>Sin rutinas asignadas.</Empty>}
      </Card>
    </div>
  );
}
