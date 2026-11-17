import { notFound, redirect } from "next/navigation";
import { ConfirmButton } from "@/components/form";
import { RecipeDetail, type Recipe } from "@/components/recipes";
import { Badge, Button, LinkButton, PageHeader } from "@/components/ui";
import { getGroups } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { deleteRow, duplicate, removeRecipeImage, uploadRecipeImage } from "../../catalog-actions";
import { ActionForm, SubmitButton } from "@/components/form";
import { recipeImageUrls } from "@/lib/recipe-images";

export default async function RecipePage({ params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params;
  const supabase = await createClient();
  const [{ data }, groups] = await Promise.all([supabase.from("recipes").select("*").eq("id", rid).single(), getGroups()]);
  if (!data) notFound();
  const r = data as Recipe;
  const cover = (await recipeImageUrls(supabase, [data]))[data.id] ?? null;
  return (
    <>
      <PageHeader title={r.name} subtitle={r.is_base ? <Badge>Catálogo base</Badge> : <Badge tone="info">Receta propia</Badge>}
        actions={<>
          <form action={async () => { "use server"; await duplicate("recipes", rid); }}><Button variant="secondary">Duplicar</Button></form>
          {!r.is_base && <LinkButton href={`/consultorio/recetas/${rid}/editar`}>Editar</LinkButton>}
          {!r.is_base && (
            <form action={async () => { "use server"; await deleteRow("recipes", rid, "/consultorio/recetas"); redirect("/consultorio/recetas"); }}>
              <ConfirmButton message="¿Eliminar receta?" size="md">Eliminar</ConfirmButton>
            </form>
          )}
        </>} />
      <RecipeDetail r={r} groups={groups} cover={cover} coverSlot={
        <div className="rounded-2xl border border-dashed border-border bg-surface p-4">
          <p className="text-sm font-semibold">{cover ? "Foto del platillo" : "Agrega una foto del platillo ya preparado"}</p>
          <p className="mb-3 text-xs text-muted">Tus pacientes la verán en su plan y en el recetario. Sin foto se muestra una ilustración con los grupos de alimentos. JPG, PNG o WEBP de hasta 5 MB.</p>
          <ActionForm action={uploadRecipeImage.bind(null, rid)} className="flex flex-wrap items-center gap-2">
            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required aria-label="Foto del platillo" className="max-w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary-soft file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary" />
            <SubmitButton size="sm" pendingText="Subiendo…">{cover ? "Cambiar foto" : "Subir foto"}</SubmitButton>
          </ActionForm>
          {cover && <form className="mt-2" action={async () => { "use server"; await removeRecipeImage(rid); }}><ConfirmButton message="¿Quitar la foto?">Quitar foto</ConfirmButton></form>}
        </div>
      } />
    </>
  );
}
