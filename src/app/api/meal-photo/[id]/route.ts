import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Foto de comida: RLS decide si el usuario puede ver el registro y el objeto. Enlace firmado de 5 minutos.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("No encontrado", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("meal_photos").select("path").eq("id", id).maybeSingle();
  if (!data) return new NextResponse("No encontrado", { status: 404 });
  const { data: signed } = await supabase.storage.from("patient-files").createSignedUrl(data.path, 300);
  if (!signed) return new NextResponse("No autorizado", { status: 403 });
  return NextResponse.redirect(signed.signedUrl);
}
