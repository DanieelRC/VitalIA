import { ExchangeFinder } from "@/components/exchange-finder";
import { Card, PageHeader } from "@/components/ui";
import { getGroups, groupLabel, type MealPlan } from "@/lib/data";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Intercambios" };

export default async function ExchangesPage() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const [groups, { data: foods }, { data: plan }] = await Promise.all([
    getGroups(),
    supabase.from("foods").select("name, portion, group_code, kcal").not("group_code", "is", null).order("name"),
    supabase.from("meal_plans").select("meals").eq("patient_id", s.patientId!).eq("status", "activo").maybeSingle(),
  ]);
  const used = new Set(((plan?.meals ?? []) as MealPlan["meals"]).flatMap((m) => Object.entries(m.equivalents ?? {}).filter(([, v]) => v > 0).map(([k]) => k)));
  const planGroups = used.size ? [...used] : groups.map((g) => g.code);

  return (
    <>
      <PageHeader title="Intercambios" subtitle="¿No tienes un alimento o se te antoja otro? Cámbialo por uno del mismo grupo sin salirte de tu plan." />
      <Card><ExchangeFinder foods={foods ?? []} groups={groups.map((g) => ({ code: g.code, label: groupLabel(g) }))} planGroups={planGroups} /></Card>
    </>
  );
}
