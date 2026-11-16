import { ProgressChart } from "@/components/progress-chart";
import { Card, Empty, fmtDate, Table, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function Progreso({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("progress_logs").select("*").eq("patient_id", id).order("logged_at", { ascending: false }).limit(200);
  const rows = data ?? [];
  const chart = [...rows].reverse().map((r) => ({ date: fmtDate(r.logged_at, { day: "2-digit", month: "short" }), peso: r.weight_kg, cintura: r.waist_cm, adherencia: r.adherence }));

  return (
    <div className="grid gap-4">
      <Card title="Registros del paciente">
        <ProgressChart data={chart} series={[{ key: "peso", label: "Peso (kg)" }, { key: "cintura", label: "Cintura (cm)" }]} />
      </Card>
      <Card>
        {rows.length ? (
          <Table head={["Fecha", "Peso", "Cintura", "Cadera", "Adherencia", "Ejercicio", "Notas"]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>{fmtDate(r.logged_at)}</Td><Td>{r.weight_kg ?? "—"}</Td><Td>{r.waist_cm ?? "—"}</Td><Td>{r.hip_cm ?? "—"}</Td>
                <Td>{r.adherence ? `${r.adherence}/5` : "—"}</Td><Td>{r.exercise_minutes ? `${r.exercise_minutes} min` : "—"}</Td><Td className="max-w-64">{r.notes}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>El paciente aún no registra su progreso desde el portal.</Empty>}
      </Card>
    </div>
  );
}
