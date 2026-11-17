import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type AdminInvoice = {
  id: string; clinic_id: string; paid_at: string; amount_mxn: number; description: string; payment_form: string;
  cfdi_status: string; cfdi_uuid: string | null; cfdi_error: string | null; stripe_invoice_id: string; clinics: { name: string } | null;
};

/** Pagos de toda la plataforma, por mes (YYYY-MM, hora de CDMX) y opcionalmente solo los que tienen CFDI pendiente. */
export async function listPayments(month?: string, problems?: boolean) {
  let q = createAdminClient().from("billing_invoices")
    .select("id, clinic_id, paid_at, amount_mxn, description, payment_form, cfdi_status, cfdi_uuid, cfdi_error, stripe_invoice_id, clinics(name)")
    .order("paid_at", { ascending: false }).limit(2000);
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(`${month}-01T00:00:00-06:00`);
    const end = new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00-06:00`);
    q = q.gte("paid_at", start.toISOString()).lt("paid_at", end.toISOString());
  }
  if (problems) q = q.in("cfdi_status", ["error", "sin_datos", "no_configurado"]);
  const { data } = await q;
  return ((data ?? []) as unknown as AdminInvoice[]).map((i) => ({ ...i, amount_mxn: Number(i.amount_mxn) }));
}
