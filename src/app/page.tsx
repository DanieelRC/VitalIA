import { redirect } from "next/navigation";
import { Landing, type LandingPlan } from "@/components/landing";
import { createAdminClient, getSession } from "@/lib/supabase/server";

export const metadata = {
  title: { absolute: "VitalIA · Software para nutriólogos con copiloto de IA" },
  description: "Expediente SOAP/PES, fórmulas, plan por equivalentes SMAE y portal del paciente, con un copiloto de IA que calcula con tus fórmulas y te deja borradores para revisar.",
};

export default async function Home() {
  const s = await getSession();
  if (s) redirect(s.role === "nutriologo" ? "/consultorio" : "/portal");
  // Los planes son públicos (nombre, límite y tope de IA); se leen en el servidor
  const { data } = await createAdminClient().from("plans").select("code, name, max_patients, price_mxn, ai_budget_usd").eq("active", true).order("sort");
  const plans: LandingPlan[] = (data ?? []).map((p) => ({ ...p, price_mxn: p.price_mxn == null ? null : Number(p.price_mxn), ai_budget_usd: Number(p.ai_budget_usd) }));
  return <Landing plans={plans} />;
}
