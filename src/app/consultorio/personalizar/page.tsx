import { PageHeader } from "@/components/ui";
import { createClient, requireRole } from "@/lib/supabase/server";
import { Personalizer, type PersonalizerData } from "./personalizer";

export const metadata = { title: "Personalizar" };

export default async function PersonalizePage() {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const [macroPresets, mealPresets, formulas, factors, fields, soap, groups, clinic] = await Promise.all([
    supabase.from("macro_presets").select("id, name, protein_pct, fat_pct, carbs_pct, note").order("name"),
    supabase.from("meal_presets").select("id, name, meals").order("name"),
    supabase.from("custom_formulas").select("id, name, expression, note").order("name"),
    supabase.from("custom_factors").select("id, kind, label, value").order("value"),
    supabase.from("custom_fields").select("id, key, label, kind, options").order("sort"),
    supabase.from("soap_templates").select("id, name, reason, subjective, objective, assessment, plan").order("name"),
    supabase.from("equivalent_groups").select("*").order("sort"),
    supabase.from("clinic_settings").select("name, pdf_accent, pdf_footer, pdf_sections").single(),
  ]);
  const data: PersonalizerData = {
    macroPresets: (macroPresets.data ?? []).map((p) => ({ ...p, protein_pct: Number(p.protein_pct), fat_pct: Number(p.fat_pct), carbs_pct: Number(p.carbs_pct) })),
    mealPresets: (mealPresets.data ?? []) as PersonalizerData["mealPresets"],
    formulas: formulas.data ?? [],
    factors: (factors.data ?? []) as PersonalizerData["factors"],
    fields: fields.data ?? [],
    soap: soap.data ?? [],
    groups: (groups.data ?? []) as PersonalizerData["groups"],
    pdf: { name: clinic.data?.name ?? "Consultorio", pdf_accent: clinic.data?.pdf_accent ?? "#177a47", pdf_footer: clinic.data?.pdf_footer ?? null, pdf_sections: (clinic.data?.pdf_sections ?? {}) as Record<string, boolean> },
  };
  return (
    <>
      <PageHeader title="Personalizar" subtitle="Tus distribuciones, fórmulas, equivalentes, expediente y documentos: el consultorio trabaja a tu manera." />
      <Personalizer data={data} />
    </>
  );
}
