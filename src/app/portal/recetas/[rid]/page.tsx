import { notFound } from "next/navigation";
import { RecipeDetail, type Recipe } from "@/components/recipes";
import { PageHeader } from "@/components/ui";
import { getGroups } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { recipeImageUrls } from "@/lib/recipe-images";

export default async function PortalRecipe({ params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params;
  const supabase = await createClient();
  const [{ data }, groups] = await Promise.all([supabase.from("recipes").select("*").eq("id", rid).single(), getGroups()]);
  if (!data) notFound();
  const cover = (await recipeImageUrls(supabase, [data]))[data.id] ?? null;
  return (<><PageHeader title={data.name} /><RecipeDetail r={data as Recipe} groups={groups} cover={cover} /></>);
}
