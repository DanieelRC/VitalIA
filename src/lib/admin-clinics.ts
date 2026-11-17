import "server-only";
import type { AdminClinic } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

const trialLive = (c: AdminClinic) => !!c.trial_ends_at && Date.parse(c.trial_ends_at) > Date.now();

export const FILTERS: Record<string, { label: string; test: (c: AdminClinic) => boolean }> = {
  pagando: { label: "Pagando", test: (c) => c.status === "activa" && c.paying },
  prueba: { label: "En prueba", test: (c) => c.status === "prueba" && trialLive(c) },
  cortesia: { label: "Cortesía", test: (c) => c.in_comp },
  sin_cobro: { label: "Activos sin cobro", test: (c) => c.status === "activa" && !c.paying && !c.in_comp },
  vencidos: { label: "Vencidos", test: (c) => c.status === "vencida" || (c.status === "prueba" && !trialLive(c)) },
  cancelados: { label: "Cancelados", test: (c) => c.status === "cancelada" },
};

/** Consultorios con búsqueda y filtros (lista del admin y exportación CSV). */
export async function listClinics(q?: string, estado?: string, plan?: string) {
  let query = createAdminClient().from("admin_clinics").select("*").order("created_at", { ascending: false }).limit(2000);
  const term = q?.trim().replace(/[%,()"\\*]/g, "").slice(0, 80);
  if (term) query = query.or(`name.ilike.*${term}*,owner_email.ilike.*${term}*,owner_name.ilike.*${term}*`);
  if (plan && /^p(5|10|20|max)$/.test(plan)) query = query.eq("plan", plan);
  const { data } = await query;
  const rows = ((data ?? []) as AdminClinic[]).map((c) => ({ ...c, ai_cost_month: Number(c.ai_cost_month), revenue_total: Number(c.revenue_total) }));
  return estado && FILTERS[estado] ? rows.filter(FILTERS[estado].test) : rows;
}
