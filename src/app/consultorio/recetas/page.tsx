import { RecipeFilters, RecipeGrid } from "@/components/recipes";
import { LinkButton, PageHeader } from "@/components/ui";
import { listRecipes } from "@/lib/recipes-query";

export const metadata = { title: "Recetas" };

export default async function Recipes({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; meal?: string }> }) {
  const sp = await searchParams;
  const recipes = await listRecipes(sp);
  return (
    <>
      <PageHeader title="Recetario" subtitle="Recetas para condiciones clínicas y alimentación normal."
        actions={<LinkButton href="/consultorio/recetas/nueva" variant="primary">Nueva receta</LinkButton>} />
      <RecipeFilters {...sp} />
      <RecipeGrid recipes={recipes} base="/consultorio/recetas" />
    </>
  );
}
