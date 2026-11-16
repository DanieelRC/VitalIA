import { RoutineView, type Routine } from "@/components/routine-view";
import { Card, Empty, PageHeader } from "@/components/ui";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Rutinas y suplementos" };

export default async function PortalRoutines() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const [r, sp] = await Promise.all([
    supabase.from("patient_routines").select("id, frequency, notes, routines(*)").eq("patient_id", s.patientId!).eq("active", true),
    supabase.from("patient_supplements").select("id, dose, schedule, notes, supplements(name, presentation)").eq("patient_id", s.patientId!).eq("active", true),
  ]);
  return (
    <>
      <PageHeader title="Rutinas y suplementos" />
      <h2 className="mb-2 font-semibold">Rutinas de ejercicio</h2>
      {r.data?.length ? (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {r.data.map((a) => {
            const rt = a.routines as unknown as Routine;
            return (
              <Card key={a.id} title={rt.name}>
                {(a.frequency || a.notes) && <p className="mb-2 text-sm"><strong>{a.frequency}</strong> {a.notes}</p>}
                <RoutineView r={rt} />
              </Card>
            );
          })}
        </div>
      ) : <div className="mb-6"><Empty>Sin rutinas asignadas.</Empty></div>}
      <h2 className="mb-2 font-semibold">Suplementos indicados</h2>
      {sp.data?.length ? (
        <Card>
          <ul className="divide-y divide-border text-sm">
            {sp.data.map((x) => {
              const sup = x.supplements as unknown as { name: string; presentation: string | null };
              return <li key={x.id} className="py-2"><p className="font-medium">{sup.name}</p><p className="text-muted">{[x.dose, x.schedule, x.notes].filter(Boolean).join(" · ")}</p></li>;
            })}
          </ul>
        </Card>
      ) : <Empty>Sin suplementos indicados.</Empty>}
      <p className="mt-4 text-xs text-muted">No modifiques dosis ni agregues suplementos sin consultarlo con tu nutriólogo.</p>
    </>
  );
}
