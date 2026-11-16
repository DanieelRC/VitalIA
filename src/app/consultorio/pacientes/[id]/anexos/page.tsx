import { revalidatePath } from "next/cache";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { Badge, Card, Empty, Field, fmtDateTime, Input, Select, Textarea } from "@/components/ui";
import { deleteAttachment, uploadAttachment } from "@/lib/actions/files";
import { createClient, requireRole } from "@/lib/supabase/server";
import type { FormState } from "@/components/form";

async function addNote(patientId: string, _: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireRole("nutriologo");
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { error: "Escribe la nota." };
  const supabase = await createClient();
  const { error } = await supabase.from("quick_notes").insert({ patient_id: patientId, body: body.slice(0, 10000) });
  if (error) return { error: error.message };
  revalidatePath(`/consultorio/pacientes/${patientId}/anexos`);
  return { ok: "Nota guardada." };
}

async function deleteNote(patientId: string, id: string) {
  "use server";
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from("quick_notes").delete().eq("id", id);
  revalidatePath(`/consultorio/pacientes/${patientId}/anexos`);
}

export default async function Anexos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [notes, files] = await Promise.all([
    supabase.from("quick_notes").select("*").eq("patient_id", id).order("created_at", { ascending: false }),
    supabase.from("attachments").select("*").eq("patient_id", id).order("created_at", { ascending: false }),
  ]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Notas de consulta" actions={<Badge tone="warn">Privadas</Badge>}>
        <ActionForm action={addNote.bind(null, id)} resetOnOk className="mb-4 flex flex-col gap-2">
          <Textarea name="body" rows={3} placeholder="Apuntes rápidos durante la consulta…" />
          <div><SubmitButton size="sm">Guardar nota</SubmitButton></div>
        </ActionForm>
        {notes.data?.length ? (
          <ul className="flex flex-col gap-2">
            {notes.data.map((n) => (
              <li key={n.id} className="rounded-lg bg-surface-2 p-3 text-sm">
                <div className="flex justify-between text-xs text-muted">
                  <span>{fmtDateTime(n.created_at)}</span>
                  <form action={deleteNote.bind(null, id, n.id)}><ConfirmButton message="¿Eliminar nota?">Eliminar</ConfirmButton></form>
                </div>
                <p className="whitespace-pre-wrap">{n.body}</p>
              </li>
            ))}
          </ul>
        ) : <Empty>Sin notas.</Empty>}
      </Card>

      <Card title="Archivos del paciente">
        <ActionForm action={uploadAttachment.bind(null, id)} resetOnOk className="mb-4 grid gap-2">
          <Input type="file" name="file" accept=".pdf,image/*" required className="py-2" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Categoría">
              <Select name="category"><option value="laboratorio">Laboratorio</option><option value="estudio">Estudio</option><option value="foto">Foto</option><option value="otro">Otro</option></Select>
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="visible_to_patient" defaultChecked /> Visible para el paciente</label>
          </div>
          <div><SubmitButton size="sm" pendingText="Subiendo…">Subir</SubmitButton></div>
        </ActionForm>
        {files.data?.length ? (
          <ul className="divide-y divide-border text-sm">
            {files.data.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                <a href={`/api/files/${f.id}`} target="_blank" className="truncate text-primary">{f.name}</a>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge>{f.category}</Badge>
                  {!f.visible_to_patient && <Badge tone="warn">Oculto</Badge>}
                  <form action={async () => { "use server"; await deleteAttachment(f.id); }}><ConfirmButton message="¿Eliminar archivo?">Eliminar</ConfirmButton></form>
                </span>
              </li>
            ))}
          </ul>
        ) : <Empty>Sin archivos.</Empty>}
      </Card>
    </div>
  );
}
