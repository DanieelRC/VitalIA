import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

/** Envía un aviso único por mes cuando el gasto de IA supera el 80 % del presupuesto. */
export async function maybeSendBudgetAlert(admin: SupabaseClient) {
  const month = new Date().toISOString().slice(0, 7);
  const { data: s } = await admin.from("ai_settings").select("monthly_budget_usd, alert_sent_month").eq("id", 1).single();
  if (!s || s.alert_sent_month === month) return;
  const { data: rows } = await admin.from("ai_usage").select("cost_usd").gte("created_at", `${month}-01T00:00:00Z`);
  const spent = (rows ?? []).reduce((a, r) => a + Number(r.cost_usd), 0);
  if (spent < Number(s.monthly_budget_usd) * 0.8) return;

  await admin.from("ai_settings").update({ alert_sent_month: month }).eq("id", 1);
  const { data: clinic } = await admin.from("clinic_settings").select("email").eq("id", 1).single();
  if (clinic?.email) {
    await sendEmail(clinic.email, "VitalIA: el asistente IA llegó al 80 % del presupuesto",
      `<p>Gasto del mes: <strong>$${spent.toFixed(2)} USD</strong> de $${Number(s.monthly_budget_usd).toFixed(2)}.</p>
       <p>Al llegar al 100 % el asistente se bloquea para pacientes. Puedes ajustar el presupuesto en Ajustes e IA.</p>`);
  }
}
