import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Descarga segura: RLS decide si el usuario puede ver el registro y el objeto.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("attachments").select("path").eq("id", id).maybeSingle();
  if (!data) return new NextResponse("No encontrado", { status: 404 });
  const { data: signed } = await supabase.storage.from("patient-files").createSignedUrl(data.path, 60);
  if (!signed) return new NextResponse("No autorizado", { status: 403 });
  return NextResponse.redirect(signed.signedUrl);
}
