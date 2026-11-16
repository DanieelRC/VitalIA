import { ActionForm, SubmitButton } from "@/components/form";
import { Badge, Card, Empty, Field, fmtDate, Input, PageHeader, Select } from "@/components/ui";
import { uploadAttachment } from "@/lib/actions/files";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Mis archivos" };

export default async function PatientFiles() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const { data } = await supabase.from("attachments").select("*").eq("patient_id", s.patientId!).order("created_at", { ascending: false });
  return (
    <>
      <PageHeader title="Mis archivos" subtitle="Comparte laboratorios, estudios o fotos con tu nutriólogo." />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          {data?.length ? (
            <ul className="divide-y divide-border text-sm">
              {data.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                  <a href={`/api/files/${f.id}`} target="_blank" className="truncate text-primary">{f.name}</a>
                  <span className="shrink-0 text-xs text-muted"><Badge>{f.category}</Badge> {fmtDate(f.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Sin archivos.</Empty>}
        </Card>
        <Card title="Subir archivo">
          <ActionForm action={uploadAttachment.bind(null, null)} resetOnOk className="grid gap-3">
            <Input type="file" name="file" accept=".pdf,image/*" required className="py-2" />
            <Field label="Tipo"><Select name="category"><option value="laboratorio">Laboratorio</option><option value="estudio">Estudio</option><option value="foto">Foto</option><option value="otro">Otro</option></Select></Field>
            <p className="text-xs text-muted">PDF o imagen, máximo 10 MB.</p>
            <div><SubmitButton size="sm" pendingText="Subiendo…">Subir</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
