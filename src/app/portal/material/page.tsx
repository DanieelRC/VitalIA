import { EducationList } from "@/components/education-list";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Material educativo" };

export default async function PatientMaterial() {
  const supabase = await createClient();
  const { data } = await supabase.from("education_materials").select("*").eq("published", true).order("created_at", { ascending: false });
  return (<><PageHeader title="Material educativo" /><EducationList items={data ?? []} /></>);
}
