import Link from "next/link";
import { Clock, Users } from "lucide-react";
import { Badge, Card, Empty, Input, Select } from "./ui";
import { MEAL_TIMES, RECIPE_TAGS, groupLabel } from "@/lib/data";
import type { Group } from "@/lib/nutrition";

export type Recipe = {
  id: string; name: string; description: string | null; meal_time: string; tags: string[]; servings: number; prep_minutes: number | null;
  ingredients: { name: string; quantity: string; unit: string }[]; steps: string[]; kcal: number | null; protein_g: number | null;
  fat_g: number | null; carbs_g: number | null; equivalents: Record<string, number>; is_base: boolean;
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

export function RecipeGrid({ recipes, base }: { recipes: Pick<Recipe, "id" | "name" | "description" | "meal_time" | "tags" | "kcal" | "prep_minutes" | "is_base">[]; base: string }) {
  if (!recipes.length) return <Empty>No hay recetas con esos filtros.</Empty>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((r) => (
        <Link key={r.id} href={`${base}/${r.id}`} className="rounded-xl border border-border bg-surface p-4 hover:border-primary">
          <p className="text-xs text-muted">{MEAL_TIMES[r.meal_time]}{r.kcal ? ` · ${r.kcal} kcal` : ""}{r.prep_minutes ? ` · ${r.prep_minutes} min` : ""}</p>
          <p className="mt-1 font-medium">{r.name}</p>
          {r.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{r.description}</p>}
          <div className="mt-2 flex flex-wrap gap-1">{r.tags.map((t) => <Badge key={t} tone="info">{RECIPE_TAGS[t] ?? t}</Badge>)}</div>
        </Link>
      ))}
    </div>
  );
}

export function RecipeDetail({ r, groups }: { r: Recipe; groups: Group[] }) {
  const gmap = Object.fromEntries(groups.map((g) => [g.code, g]));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-4">
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
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted">Energía</dt><dd className="text-right font-semibold">{r.kcal ?? "—"} kcal</dd>
            <dt className="text-muted">Proteína</dt><dd className="text-right">{r.protein_g ?? "—"} g</dd>
            <dt className="text-muted">Lípidos</dt><dd className="text-right">{r.fat_g ?? "—"} g</dd>
            <dt className="text-muted">Hidratos</dt><dd className="text-right">{r.carbs_g ?? "—"} g</dd>
          </dl>
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
