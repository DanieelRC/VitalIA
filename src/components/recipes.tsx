import Link from "next/link";
import { Clock, Users } from "lucide-react";
import { Badge, Card, Empty, Input, Select } from "./ui";
import { MEAL_TIMES, RECIPE_TAGS, groupLabel } from "@/lib/data";
import type { Group } from "@/lib/nutrition";
import { RecipeCover } from "./recipe-cover";
import { MacroBar } from "./plate";

export type Recipe = {
  id: string; name: string; description: string | null; meal_time: string; tags: string[]; servings: number; prep_minutes: number | null;
  ingredients: { name: string; quantity: string; unit: string }[]; steps: string[]; kcal: number | null; protein_g: number | null;
  fat_g: number | null; carbs_g: number | null; equivalents: Record<string, number>; is_base: boolean; image_path?: string | null;
};

export function RecipeFilters({ q, tag, meal }: { q?: string; tag?: string; meal?: string }) {
  return (
    <form className="mb-4 flex flex-wrap gap-2">
      <Input name="q" defaultValue={q} placeholder="Buscar receta" className="max-w-xs" />
      <Select name="tag" defaultValue={tag ?? ""} className="max-w-52">
        <option value="">Todas las condiciones</option>
        {Object.entries(RECIPE_TAGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      <Select name="meal" defaultValue={meal ?? ""} className="max-w-40">
        <option value="">Todo tiempo</option>
        {Object.entries(MEAL_TIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      <button className="h-10 rounded-lg border border-border px-4 text-sm">Filtrar</button>
    </form>
  );
}

export function RecipeGrid({ recipes, base }: { recipes: (Pick<Recipe, "id" | "name" | "description" | "meal_time" | "tags" | "kcal" | "prep_minutes" | "is_base"> & { equivalents?: Record<string, number>; cover?: string | null })[]; base: string }) {
  if (!recipes.length) return <Empty>No hay recetas con esos filtros.</Empty>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((r) => (
        <Link key={r.id} href={`${base}/${r.id}`} className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-soft transition-[box-shadow,transform,border-color] duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift">
          <div className="relative overflow-hidden">
            <RecipeCover name={r.name} mealTime={r.meal_time} equivalents={r.equivalents} src={r.cover} rounded={false} className="transition-transform duration-500 ease-out-expo group-hover:scale-[1.04]" />
            <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">{MEAL_TIMES[r.meal_time]}</span>
            {r.kcal != null && <span className="tabular absolute bottom-3 right-3 rounded-full bg-field px-2.5 py-1 text-[11px] font-bold text-field-fg">{Math.round(Number(r.kcal))} kcal</span>}
          </div>
          <div className="p-4">
            <p className="font-display text-lg font-bold leading-tight">{r.name}</p>
            {r.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{r.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {r.prep_minutes ? <span className="mr-1 flex items-center gap-1 text-xs text-muted"><Clock className="size-3.5" />{r.prep_minutes} min</span> : null}
              {r.tags.map((t) => <Badge key={t} tone="info">{RECIPE_TAGS[t] ?? t}</Badge>)}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function RecipeDetail({ r, groups, cover, coverSlot }: { r: Recipe; groups: Group[]; cover?: string | null; coverSlot?: React.ReactNode }) {
  const gmap = Object.fromEntries(groups.map((g) => [g.code, g]));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-2xl border border-border shadow-soft"><RecipeCover name={r.name} mealTime={r.meal_time} equivalents={r.equivalents} src={cover} rounded={false} className="max-h-[420px]" /></div>
        {coverSlot}
        <Card>
          {r.description && <p className="mb-3 text-muted">{r.description}</p>}
          <div className="mb-3 flex flex-wrap gap-3 text-sm text-muted">
            <span className="flex items-center gap-1"><Users className="size-4" /> {r.servings} porción(es)</span>
            {r.prep_minutes && <span className="flex items-center gap-1"><Clock className="size-4" /> {r.prep_minutes} min</span>}
            <span>{MEAL_TIMES[r.meal_time]}</span>
          </div>
          <div className="flex flex-wrap gap-1">{r.tags.map((t) => <Badge key={t} tone="info">{RECIPE_TAGS[t] ?? t}</Badge>)}</div>
        </Card>
        <Card title="Ingredientes">
          <ul className="list-disc pl-5 text-sm">{r.ingredients.map((i, k) => <li key={k}>{[i.quantity, i.unit, i.name].filter(Boolean).join(" ")}</li>)}</ul>
        </Card>
        <Card title="Modo de preparación">
          <ol className="list-decimal space-y-2 pl-5 text-sm">{r.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
        </Card>
      </div>
      <aside className="flex flex-col gap-4">
        <Card title="Aporte por porción">
          <p className="tabular font-display text-3xl font-extrabold">{r.kcal ?? "—"} <span className="text-sm font-semibold text-muted">kcal</span></p>
          {r.protein_g != null && r.fat_g != null && r.carbs_g != null && <MacroBar className="mt-3" protein={Number(r.protein_g)} fat={Number(r.fat_g)} carbs={Number(r.carbs_g)} />}
        </Card>
        <Card title="Equivalentes por porción">
          <ul className="text-sm">
            {Object.entries(r.equivalents).map(([k, v]) => <li key={k} className="flex justify-between py-0.5"><span>{gmap[k] ? groupLabel(gmap[k]) : k}</span><span>{v}</span></li>)}
          </ul>
        </Card>
      </aside>
    </div>
  );
}
