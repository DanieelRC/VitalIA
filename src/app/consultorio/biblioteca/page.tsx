import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionForm, ConfirmButton, SubmitButton, type FormState } from "@/components/form";
import { EducationList } from "@/components/education-list";
import { Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Material educativo" };

async function addMaterial(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireRole("nutriologo");
  const d = z.object({
    title: z.string().trim().min(2).max(200), category: z.string().max(100).optional(), description: z.string().max(500).optional(),
    body: z.string().max(20000).optional(), url: z.url().optional().or(z.literal("")),
  }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: "Revisa título y URL." };
  const supabase = await createClient();
  let file_path: string | null = null;
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 20 * 1024 * 1024) return { error: "Máximo 20 MB." };
    if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type)) return { error: "Solo PDF o imagen." };
    file_path = `${crypto.randomUUID()}.${file.type === "application/pdf" ? "pdf" : file.type.split("/")[1]}`;
    const up = await supabase.storage.from("education").upload(file_path, file, { contentType: file.type });
    if (up.error) return { error: up.error.message };
  }
  const { error } = await supabase.from("education_materials").insert({ ...d.data, url: d.data.url || null, file_path });
  if (error) return { error: error.message };
  revalidatePath("/consultorio/biblioteca");
  return { ok: "Material publicado." };
}

async function setPublished(id: string, published: boolean) {
  "use server";
  await requireRole("nutriologo");
  const supabase = await createClient();
  await supabase.from("education_materials").update({ published }).eq("id", id);
  revalidatePath("/consultorio/biblioteca");
}

async function remove(id: string) {
  "use server";
  await requireRole("nutriologo");
  const supabase = await createClient();
  const { data } = await supabase.from("education_materials").select("file_path").eq("id", id).single();
  if (data?.file_path) await supabase.storage.from("education").remove([data.file_path]);
  await supabase.from("education_materials").delete().eq("id", id);
  revalidatePath("/consultorio/biblioteca");
}

export default async function Library() {
  const supabase = await createClient();
  const { data } = await supabase.from("education_materials").select("*").order("created_at", { ascending: false });
  return (
    <>
      <PageHeader title="Material educativo" subtitle="Lo publicado es visible para todos los pacientes en su portal." />
      <EducationList items={data ?? []} actions={(m) => (
        <div className="flex gap-2">
          <form action={setPublished.bind(null, m.id, !m.published)}><Button size="sm" variant="ghost">{m.published ? "Ocultar" : "Publicar"}</Button></form>
          <form action={remove.bind(null, m.id)}><ConfirmButton message="¿Eliminar material?">Eliminar</ConfirmButton></form>
        </div>
      )} />
      <Card title="Agregar material" className="mt-4">
        <ActionForm action={addMaterial} resetOnOk className="grid gap-3 sm:grid-cols-2">
          <Field label="Título"><Input name="title" required /></Field>
          <Field label="Categoría"><Input name="category" placeholder="Hábitos, Diabetes…" /></Field>
          <Field label="Descripción breve" className="sm:col-span-2"><Input name="description" /></Field>
          <Field label="Contenido" className="sm:col-span-2"><Textarea name="body" rows={4} /></Field>
          <Field label="Archivo (PDF o imagen)"><Input type="file" name="file" accept=".pdf,image/*" className="py-2" /></Field>
          <Field label="Enlace externo"><Input name="url" type="url" /></Field>
          <div><SubmitButton size="sm">Publicar</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
