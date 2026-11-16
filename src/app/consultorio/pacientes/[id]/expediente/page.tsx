import Link from "next/link";
import { Badge, Button, Card, Empty, fmtDateTime } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { createConsultation } from "./actions";

export default async function Expediente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("consultations")
    .select("id, consulted_at, reason, status, assessment, pes_diagnoses(problem)")
    .eq("patient_id", id).order("consulted_at", { ascending: false });

  return (
    <Card title="Notas de consulta (SOAP + PES)" actions={
      <form action={async () => { "use server"; await createConsultation(id); }}><Button size="sm">Nueva consulta</Button></form>
    }>
      {data?.length ? (
        <ol className="relative ml-2 border-l border-border">
          {data.map((c) => (
            <li key={c.id} className="mb-5 ml-4">
              <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-primary" />
              <Link href={`/consultorio/pacientes/${id}/expediente/${c.id}`} className="font-medium text-primary">
                {fmtDateTime(c.consulted_at)} {c.reason ? `· ${c.reason}` : ""}
              </Link>
              <span className="ml-2">{c.status === "firmada" ? <Badge tone="primary">Firmada</Badge> : <Badge tone="warn">Borrador</Badge>}</span>
              {(c.pes_diagnoses as { problem: string }[]).length > 0 && (
                <p className="mt-1 text-sm text-muted">Dx: {(c.pes_diagnoses as { problem: string }[]).map((d) => d.problem).join("; ")}</p>
              )}
            </li>
          ))}
        </ol>
      ) : <Empty>Sin consultas registradas.</Empty>}
    </Card>
  );
}
