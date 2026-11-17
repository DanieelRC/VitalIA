"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAdminAction, requireAdmin } from "@/lib/admin";
import { issueCfdi } from "@/lib/billing/cfdi";
import { createAdminClient } from "@/lib/supabase/server";

/** Reintenta timbrar el CFDI de cualquier pago (p. ej., después de corregir los datos fiscales). */
export async function adminRetryCfdi(invoiceId: string): Promise<{ ok?: string; error?: string }> {
  const s = await requireAdmin();
  if (!z.uuid().safeParse(invoiceId).success) return { error: "Pago inválido." };
  const { data: inv } = await createAdminClient().from("billing_invoices").select("id, clinic_id, cfdi_status").eq("id", invoiceId).maybeSingle();
  if (!inv) return { error: "Pago no encontrado." };
  const r = await issueCfdi(inv.id);
  await logAdminAction({ adminId: s.userId, clinicId: inv.clinic_id, action: "cfdi_retry", reason: `Reintento de CFDI (${r.status})`, before: { cfdi_status: inv.cfdi_status }, after: { cfdi_status: r.status } });
  revalidatePath("/admin/pagos");
  if (r.ok) return { ok: "Factura emitida." };
  const msg: Record<string, string> = { sin_datos: "El consultorio no ha capturado sus datos fiscales.", no_configurado: "Falta FACTURAPI_KEY.", pendiente: "Ya se está procesando." };
  return { error: msg[r.status] ?? r.error ?? "No se pudo emitir." };
}
