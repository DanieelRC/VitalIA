import Link from "next/link";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { RoutineView, type Routine } from "@/components/routine-view";
import { Badge, Card, Field, Input, LinkButton, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { deleteRow, saveExercise } from "../catalog-actions";

export const metadata = { title: "Ejercicios y rutinas" };

const TYPES = { aerobico: "Aeróbico", anaerobico: "Anaeróbico", flexibilidad: "Flexibilidad" } as Record<string, string>;

export default async function Exercises() {
  const supabase = await createClient();
  const [ex, rt] = await Promise.all([
    supabase.from("exercises").select("*").order("type").order("name"),
    supabase.from("routines").select("*").order("name"),
  ]);
  return (
    <>
      <PageHeader title="Ejercicios y rutinas" actions={<LinkButton href="/consultorio/ejercicios/rutinas/nueva" variant="primary">Nueva rutina</LinkButton>} />
      <h2 className="mb-2 font-semibold">Rutinas</h2>
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        {rt.data?.map((r) => (
          <Card key={r.id} title={<Link href={`/consultorio/ejercicios/rutinas/${r.id}`} className="text-primary">{r.name}</Link>}
            actions={!r.is_base ? <Badge tone="info">propia</Badge> : <Badge>base</Badge>}>
            <RoutineView r={r as Routine} />
          </Card>
        ))}
      </div>
      <Card title="Biblioteca de ejercicios" className="mb-4">
        <Table head={["Ejercicio", "Tipo", "Grupo muscular", "Equipo", "MET", ""]}>
          {ex.data?.map((e) => (
            <tr key={e.id}>
              <Td><span className="font-medium">{e.name}</span>{e.description && <p className="text-xs text-muted">{e.description}</p>}</Td>
              <Td><Badge tone={e.type === "aerobico" ? "primary" : e.type === "anaerobico" ? "info" : "neutral"}>{TYPES[e.type]}</Badge></Td>
              <Td>{e.muscle_group}</Td><Td>{e.equipment}</Td><Td>{e.met}</Td>
              <Td>{!e.is_base && <form action={async () => { "use server"; await deleteRow("exercises", e.id, "/consultorio/ejercicios"); }}><ConfirmButton message="¿Eliminar?">Eliminar</ConfirmButton></form>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Agregar ejercicio">
        <ActionForm action={saveExercise} resetOnOk className="grid gap-3 sm:grid-cols-3">
          <Field label="Nombre"><Input name="name" required /></Field>
          <Field label="Tipo"><Select name="type">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="MET" hint="Compendio de actividades físicas"><Input name="met" inputMode="decimal" /></Field>
          <Field label="Grupo muscular"><Input name="muscle_group" /></Field>
          <Field label="Equipo"><Input name="equipment" /></Field>
          <Field label="Video (URL)"><Input name="video_url" type="url" /></Field>
          <Field label="Técnica" className="sm:col-span-3"><Textarea name="description" rows={2} /></Field>
          <div><SubmitButton size="sm">Agregar</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
