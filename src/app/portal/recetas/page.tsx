import { RecipeFilters, RecipeGrid } from "@/components/recipes";
import { PageHeader } from "@/components/ui";
import { listRecipes } from "@/lib/recipes-query";

export const metadata = { title: "Recetas" };

export default async function PortalRecipes({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; meal?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Recetas" subtitle="Elige recetas que encajen con los equivalentes de tu plan." />
      <RecipeFilters {...sp} />
      <RecipeGrid recipes={await listRecipes(sp)} base="/portal/recetas" />
    </>
  );
}
