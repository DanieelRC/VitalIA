import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-layout";

/** Envía un aviso único por mes cuando el gasto de IA supera el 80 % del presupuesto. */
export async function maybeSendBudgetAlert(admin: SupabaseClient, clinicId: string) {
  const month = new Date().toISOString().slice(0, 7);
  const [{ data: s }, { data: c }] = await Promise.all([
    admin.from("ai_settings").select("monthly_budget_usd, alert_sent_month").eq("clinic_id", clinicId).single(),
    admin.from("clinics").select("plans(ai_budget_usd)").eq("id", clinicId).single(),
  ]);
  if (!s || s.alert_sent_month === month) return;
  const planCap = Number((c?.plans as unknown as { ai_budget_usd: number } | null)?.ai_budget_usd ?? Infinity);
  const budget = Math.min(Number(s.monthly_budget_usd), planCap);
  const { data: rows } = await admin.from("ai_usage").select("cost_usd").eq("clinic_id", clinicId).gte("created_at", `${month}-01T00:00:00Z`);
  const spent = (rows ?? []).reduce((a, r) => a + Number(r.cost_usd), 0);
  if (spent < budget * 0.8) return;

  await admin.from("ai_settings").update({ alert_sent_month: month }).eq("clinic_id", clinicId);
  const { data: clinic } = await admin.from("clinic_settings").select("email").eq("clinic_id", clinicId).single();
  if (clinic?.email) {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    await sendEmail(clinic.email, "VitalIA: el asistente IA llegó al 80 % del presupuesto", renderEmail({
      preheader: `Llevas $${spent.toFixed(2)} USD de $${budget.toFixed(2)} este mes.`,
      badge: { label: "Presupuesto de IA", tone: "warn" },
      title: "Tu asistente de IA llegó al 80 % del presupuesto",
      paragraphs: ["Al llegar al 100 %, el asistente se pausa para tus pacientes; tú conservas una reserva para seguir usándolo en consulta. Puedes ajustar el presupuesto cuando quieras."],
      details: [["Gasto del mes", `$${spent.toFixed(2)} USD`], ["Presupuesto", `$${budget.toFixed(2)} USD`]],
      cta: { label: "Ir a Ajustes e IA", url: `${site}/consultorio/ajustes` },
      footer: "Recibes este aviso una vez al mes como responsable del consultorio.",
    }));
  }
}
