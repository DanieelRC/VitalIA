import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("education_materials").select("file_path").eq("id", id).maybeSingle();
  if (!data?.file_path) return new NextResponse("No encontrado", { status: 404 });
  const { data: signed } = await supabase.storage.from("education").createSignedUrl(data.file_path, 60);
  if (!signed) return new NextResponse("No autorizado", { status: 403 });
  return NextResponse.redirect(signed.signedUrl);
}
