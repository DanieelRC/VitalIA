import { ShoppingList } from "@/components/shopping-list";
import { Card, Empty, PageHeader } from "@/components/ui";
import type { MealPlan } from "@/lib/data";
import { buildShoppingList, type Ingredient } from "@/lib/shopping";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Lista del súper" };

export default async function ShoppingPage() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const { data: plan } = await supabase.from("meal_plans").select("id, menu, updated_at").eq("patient_id", s.patientId!).eq("status", "activo").maybeSingle();
  const menu = ((plan?.menu ?? []) as MealPlan["menu"]).filter((m) => m.recipe_id);

  const times = new Map<string, number>();
  for (const m of menu) times.set(m.recipe_id!, (times.get(m.recipe_id!) ?? 0) + 1);
  const [{ data: recipes }, { data: foods }] = await Promise.all([
    times.size ? supabase.from("recipes").select("id, ingredients, servings").in("id", [...times.keys()]) : Promise.resolve({ data: [] }),
    supabase.from("foods").select("name, group_code"),
  ]);
  const items = buildShoppingList(
    (recipes ?? []).map((r) => ({ ingredients: (r.ingredients ?? []) as Ingredient[], servings: r.servings, times: times.get(r.id) ?? 1 })),
    foods ?? [],
  );

  return (
    <>
      <PageHeader title="Lista del súper" subtitle="Lo que necesitas para las recetas de tu menú de esta semana, ya sumado." />
      {items.length ? (
        <Card><ShoppingList items={items} storageKey={`super-${plan!.id}-${plan!.updated_at}`} /></Card>
      ) : (
        <Empty>Tu plan todavía no tiene recetas en el menú semanal. Cuando tu nutriólogo las agregue, aquí aparecerá tu lista.</Empty>
      )}
    </>
  );
}
