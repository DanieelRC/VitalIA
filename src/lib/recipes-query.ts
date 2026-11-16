import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function listRecipes({ q, tag, meal }: { q?: string; tag?: string; meal?: string }) {
  const supabase = await createClient();
  let query = supabase.from("recipes").select("id, name, description, meal_time, tags, kcal, prep_minutes, is_base").order("name");
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  if (tag) query = query.contains("tags", [tag]);
  if (meal) query = query.eq("meal_time", meal);
  const { data } = await query;
  return data ?? [];
}
