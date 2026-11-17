import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** URLs firmadas (1 h) de las fotos de recetas; el bucket es privado. Devuelve {id: url}. */
export async function recipeImageUrls(supabase: SupabaseClient, rows: { id: string; image_path?: string | null }[]): Promise<Record<string, string>> {
  const withImg = rows.filter((r) => r.image_path);
  if (!withImg.length) return {};
  const { data } = await supabase.storage.from("recipes").createSignedUrls(withImg.map((r) => r.image_path!), 3600);
  const out: Record<string, string> = {};
  withImg.forEach((r, i) => { const u = data?.[i]?.signedUrl; if (u) out[r.id] = u; });
  return out;
}
