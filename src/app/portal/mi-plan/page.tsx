import { PlanView } from "@/components/plan-view";
import { Empty, LinkButton, PageHeader } from "@/components/ui";
import { getGroups, type MealPlan } from "@/lib/data";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Mi plan" };

export default async function MyPlan() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const [{ data: plan }, groups, { data: foods }, { data: recipes }] = await Promise.all([
    supabase.from("meal_plans").select("*").eq("patient_id", s.patientId!).eq("status", "activo").maybeSingle(),
    getGroups(),
    supabase.from("foods").select("name, portion, group_code").eq("is_base", true).order("name"),
    supabase.from("recipes").select("id, name"),
  ]);
  if (!plan) return (<><PageHeader title="Mi plan" /><Empty>Tu nutriólogo aún no te asigna un plan.</Empty></>);
  return (
    <>
      <PageHeader title={plan.name} actions={<LinkButton href={`/api/pdf/plan/${plan.id}`} target="_blank">Descargar PDF</LinkButton>} />
      <PlanView plan={plan as MealPlan} groups={groups} foods={foods ?? []} recipeBase="/portal/recetas"
        recipes={Object.fromEntries((recipes ?? []).map((r) => [r.id, r.name]))} />
    </>
  );
}
