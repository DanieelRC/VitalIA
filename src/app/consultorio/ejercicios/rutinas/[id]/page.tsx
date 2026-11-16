import { notFound } from "next/navigation";
import { RoutineView, type Routine } from "@/components/routine-view";
import { Button, Card, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { duplicate } from "../../../catalog-actions";
import { RoutineBuilder } from "./routine-builder";

export default async function RoutinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: exercises }, routine] = await Promise.all([
    supabase.from("exercises").select("id, name, type").order("name"),
    id === "nueva" ? Promise.resolve({ data: null }) : supabase.from("routines").select("*").eq("id", id).single(),
  ]);
  if (id !== "nueva" && !routine.data) notFound();
  const r = routine.data as (Routine & { is_base: boolean }) | null;

  if (r?.is_base) {
    return (
      <>
        <PageHeader title={r.name} subtitle="Rutina del catálogo base"
          actions={<form action={async () => { "use server"; await duplicate("routines", id); }}><Button variant="secondary">Duplicar para editar</Button></form>} />
        <Card><RoutineView r={r} /></Card>
      </>
    );
  }
  return (
    <>
      <PageHeader title={r ? `Editar: ${r.name}` : "Nueva rutina"} />
      <RoutineBuilder id={r?.id ?? null} initial={r} exercises={exercises ?? []} />
    </>
  );
}
