import { NextResponse } from "next/server";
import { downloadCfdi } from "@/lib/billing/cfdi";
import { createClient } from "@/lib/supabase/server";

/** PDF o XML del CFDI de un pago. RLS limita la consulta al titular del consultorio. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; formato: string }> }) {
  const { id, formato } = await params;
  if (formato !== "pdf" && formato !== "xml") return new NextResponse("Formato inválido", { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("No encontrado", { status: 404 });
  const supabase = await createClient();
  const { data: inv } = await supabase.from("billing_invoices").select("cfdi_id, cfdi_uuid").eq("id", id).maybeSingle();
  if (!inv?.cfdi_id) return new NextResponse("No encontrado", { status: 404 });
  const res = await downloadCfdi(inv.cfdi_id, formato);
  if (!res?.body) return new NextResponse("No se pudo descargar la factura", { status: 502 });
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": formato === "pdf" ? "application/pdf" : "application/xml",
      "Content-Disposition": `attachment; filename="factura-vitalia-${inv.cfdi_uuid ?? id}.${formato}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
