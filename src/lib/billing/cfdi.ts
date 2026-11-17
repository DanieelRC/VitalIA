import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

const API = "https://www.facturapi.io/v2";
/** SAT: «Proveedores de servicios de aplicación» (software como servicio) y «Unidad de servicio». */
const PRODUCT_KEY = "81112106";
const UNIT_KEY = "E48";

function key() {
  const k = process.env.FACTURAPI_KEY;
  if (!k) return null;
  if (/_live_/.test(k) && process.env.BILLING_ALLOW_LIVE !== "1") return null;
  return k;
}
export const cfdiConfigured = () => key() != null;

async function facturapi(path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
}

/**
 * Timbra el CFDI 4.0 de un pago y lo envía por correo. Idempotente: no vuelve a timbrar uno ya emitido,
 * y «reclama» la fila antes de llamar a Facturapi para que dos procesos no timbren el mismo pago.
 */
export async function issueCfdi(invoiceId: string): Promise<{ ok: boolean; status: string; error?: string }> {
  const admin = createAdminClient();
  const { data: inv } = await admin.from("billing_invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!inv) return { ok: false, status: "error", error: "Pago no encontrado" };
  if (inv.cfdi_status === "timbrada") return { ok: true, status: "timbrada" };

  const set = async (cfdi_status: string, cfdi_error: string | null = null, extra: Record<string, unknown> = {}) => {
    await admin.from("billing_invoices").update({ cfdi_status, cfdi_error, ...extra }).eq("id", invoiceId);
    return { ok: cfdi_status === "timbrada", status: cfdi_status, error: cfdi_error ?? undefined };
  };
  if (!cfdiConfigured()) return set("no_configurado");

  const [{ data: bp }, { data: cs }] = await Promise.all([
    admin.from("billing_profiles").select("*").eq("clinic_id", inv.clinic_id).maybeSingle(),
    admin.from("clinic_settings").select("email").eq("clinic_id", inv.clinic_id).maybeSingle(),
  ]);
  if (!bp) return set("sin_datos");

  // Reclamo atómico: solo una ejecución pasa de «no timbrada» a «procesando»
  const { data: claimed } = await admin.from("billing_invoices")
    .update({ cfdi_status: "pendiente", cfdi_error: "procesando" })
    .eq("id", invoiceId).neq("cfdi_status", "timbrada").or("cfdi_error.is.null,cfdi_error.neq.procesando")
    .select("id").maybeSingle();
  if (!claimed) return { ok: false, status: "pendiente", error: "Ya se está procesando" };

  const email = bp.email ?? cs?.email ?? undefined;
  try {
    const res = await facturapi("/invoices", {
      method: "POST",
      body: JSON.stringify({
        customer: { legal_name: bp.legal_name, tax_id: bp.rfc, tax_system: bp.tax_regime, email, address: { zip: bp.zip } },
        items: [{
          quantity: 1,
          product: {
            description: inv.description, product_key: PRODUCT_KEY, unit_key: UNIT_KEY, unit_name: "Unidad de servicio",
            price: Number(inv.amount_mxn), tax_included: true, taxes: [{ type: "IVA", rate: 0.16 }],
          },
        }],
        payment_form: inv.payment_form,
        payment_method: "PUE",
        use: bp.cfdi_use,
        external_id: inv.stripe_invoice_id,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; uuid?: string; message?: string };
    if (!res.ok || !body.id) return set("error", (body.message ?? `Facturapi respondió ${res.status}`).slice(0, 500));
    await set("timbrada", null, { cfdi_id: body.id, cfdi_uuid: body.uuid ?? null });
    if (email) await facturapi(`/invoices/${body.id}/email`, { method: "POST", body: JSON.stringify({ email }) }).catch(() => null);
    return { ok: true, status: "timbrada" };
  } catch (e) {
    return set("error", e instanceof Error ? e.message.slice(0, 500) : "Error de red con Facturapi");
  }
}

/** Descarga el PDF o XML de un CFDI ya timbrado. */
export async function downloadCfdi(cfdiId: string, format: "pdf" | "xml") {
  if (!cfdiConfigured() || !/^[a-zA-Z0-9]+$/.test(cfdiId)) return null;
  const res = await facturapi(`/invoices/${cfdiId}/${format}`);
  return res.ok ? res : null;
}
