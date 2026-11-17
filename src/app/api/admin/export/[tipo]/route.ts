import { NextResponse } from "next/server";
import { clinicLabel, isPlatformAdmin, toCsv } from "@/lib/admin";
import { listClinics } from "@/lib/admin-clinics";
import { listPayments } from "@/lib/admin-payments";
import { createClient, getSession } from "@/lib/supabase/server";

const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" }) : "");

/** Exportaciones CSV del panel de administración (consultorios o pagos). Solo admin con 2FA. */
export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const s = await getSession();
  const { data: aal } = await (await createClient()).auth.mfa.getAuthenticatorAssuranceLevel();
  if (!s || !(await isPlatformAdmin(s.userId)) || aal?.currentLevel !== "aal2") return new NextResponse("No encontrado", { status: 404 });
  const { tipo } = await params;
  const sp = new URL(req.url).searchParams;
  let csv: string;
  if (tipo === "consultorios") {
    const rows = await listClinics(sp.get("q") ?? undefined, sp.get("estado") ?? undefined, sp.get("plan") ?? undefined);
    csv = toCsv(
      ["Consultorio", "Titular", "Correo", "Estado", "Plan", "Vigencia", "Pacientes activos", "IA del mes (USD)", "Cobrado (MXN)", "Datos fiscales", "Último acceso", "Alta"],
      rows.map((c) => [c.name, c.owner_name, c.owner_email, clinicLabel(c).label, c.plan_name,
        d(c.status === "prueba" ? c.trial_ends_at : c.in_comp ? c.comp_until : c.current_period_end),
        c.active_patients, c.ai_cost_month.toFixed(2), c.revenue_total.toFixed(2), c.has_fiscal ? "Sí" : "No", d(c.last_sign_in_at), d(c.created_at)]),
    );
  } else if (tipo === "pagos") {
    const rows = await listPayments(sp.get("mes") ?? undefined, sp.get("cfdi") === "problemas");
    csv = toCsv(
      ["Fecha", "Consultorio", "Concepto", "Total (MXN)", "Subtotal", "IVA", "Forma de pago SAT", "Estado CFDI", "UUID", "Factura Stripe"],
      rows.map((r) => [d(r.paid_at), r.clinics?.name, r.description, r.amount_mxn.toFixed(2), (r.amount_mxn / 1.16).toFixed(2),
        (r.amount_mxn - r.amount_mxn / 1.16).toFixed(2), r.payment_form, r.cfdi_status, r.cfdi_uuid, r.stripe_invoice_id]),
    );
  } else return new NextResponse("No encontrado", { status: 404 });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vitalia-${tipo}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
