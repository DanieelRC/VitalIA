import { notFound } from "next/navigation";
import type { Recipe } from "@/components/recipes";
import { Alert, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { RecipeForm } from "../../recipe-form";

export default async function EditRecipe({ params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("*").eq("id", rid).single();
  if (!data) notFound();
  return (
    <>
      <PageHeader title={`Editar: ${data.name}`} />
      {data.is_base ? <Alert tone="warn">Las recetas base no se editan. Duplícala primero.</Alert> : <RecipeForm r={data as Recipe} />}
    </>
  );
}
