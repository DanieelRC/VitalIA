import { notFound, redirect } from "next/navigation";
import { ConfirmButton } from "@/components/form";
import { RecipeDetail, type Recipe } from "@/components/recipes";
import { Badge, Button, LinkButton, PageHeader } from "@/components/ui";
import { getGroups } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { deleteRow, duplicate } from "../../catalog-actions";

export default async function RecipePage({ params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params;
  const supabase = await createClient();
  const [{ data }, groups] = await Promise.all([supabase.from("recipes").select("*").eq("id", rid).single(), getGroups()]);
  if (!data) notFound();
  const r = data as Recipe;
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
      <RecipeDetail r={r} groups={groups} />
    </>
  );
}
