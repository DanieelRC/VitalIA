import Link from "next/link";
import { Card } from "./ui";
import { GroupDot, MacroBar, Plate } from "./plate";
import { groupLabel, type MealPlan } from "@/lib/data";
import { plateSegments } from "@/lib/groups";
import type { Group } from "@/lib/nutrition";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function PlanView({ plan, groups, recipes, foods, recipeBase }: {
  plan: MealPlan; groups: Group[]; recipes: Record<string, string>;
  foods: { name: string; portion: string; group_code: string | null }[]; recipeBase: string;
}) {
  const gmap = Object.fromEntries(groups.map((g) => [g.code, g]));
  const usedGroups = groups.filter((g) => plan.meals.some((m) => (m.equivalents[g.code] ?? 0) > 0));
  return (
    <div className="grid gap-4">
      <section className="grid gap-5 rounded-2xl border border-border bg-surface p-5 shadow-soft sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
        <div>
          <p className="text-sm text-muted">Energía diaria</p>
          <p className="font-display text-5xl font-extrabold tracking-tight tabular">{Math.round(plan.kcal_target).toLocaleString("es-MX")}<span className="ml-1.5 text-lg font-semibold text-muted">kcal</span></p>
        </div>
        <MacroBar protein={plan.macros.protein_g} fat={plan.macros.fat_g} carbs={plan.macros.carbs_g} />
      </section>

      <Card title="Tus tiempos de comida">
        <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plan.meals.map((m, i) => (
            <article key={i} className="flex min-w-0 gap-4 rounded-2xl bg-surface-2 p-4">
              <Plate segments={plateSegments(m.equivalents)} size={68} />
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-bold leading-tight">{m.name}</h3>
                <p className="text-xs text-muted tabular">{m.kcal_pct} % · ~{Math.round((plan.kcal_target * m.kcal_pct) / 100)} kcal</p>
                <ul className="mt-2 grid gap-1 text-sm">
                  {Object.entries(m.equivalents).filter(([, v]) => v > 0).map(([k, v]) => (
                    <li key={k} className="flex items-start gap-2">
                      <GroupDot code={k} className="mt-1.5" />
                      <span className="min-w-0 flex-1 leading-snug">
                        {gmap[k]?.name ?? k}
                        {gmap[k]?.subgroup && <span className="block text-xs text-muted">{gmap[k].subgroup}</span>}
                      </span>
                      <span className="tabular font-semibold">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </Card>

      {plan.menu.length > 0 && (
        <Card title="Menú de la semana">
          <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
            {DAYS.map((d, di) => {
              const items = plan.menu.filter((x) => x.day === di + 1).sort((a, b) => a.meal - b.meal);
              if (!items.length) return null;
              return (
                <div key={d}>
                  <h3 className="mb-1.5 font-display font-bold">{d}</h3>
                  <ul className="divide-y divide-border text-sm">
                    {items.map((x, k) => (
                      <li key={k} className="flex gap-3 py-1.5">
                        <span className="w-32 shrink-0 text-muted">{plan.meals[x.meal]?.name}</span>
                        <span className="min-w-0">
                          {x.recipe_id && recipes[x.recipe_id] ? <Link className="font-medium text-primary hover:underline" href={`${recipeBase}/${x.recipe_id}`}>{recipes[x.recipe_id]}</Link> : null}
                          {x.text ? ` ${x.text}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {plan.recommendations && <Card title="Recomendaciones de tu nutriólogo"><p className="max-w-prose whitespace-pre-wrap text-sm">{plan.recommendations}</p></Card>}

      <Card title="Lista de intercambio">
        <p className="-mt-2 mb-4 text-sm text-muted">Cada alimento de la lista equivale a 1 porción de su grupo: puedes cambiar uno por otro del mismo color.</p>
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
          {usedGroups.map((g) => (
            <div key={g.code}>
              <h3 className="mb-1.5 flex items-center gap-2 font-semibold"><GroupDot code={g.code} className="size-3" />{groupLabel(g)}</h3>
              <ul className="text-sm text-muted">
                {foods.filter((f) => f.group_code === g.code).slice(0, 14).map((f) => (
                  <li key={f.name} className="flex justify-between gap-3 py-0.5"><span className="text-text">{f.name}</span><span className="shrink-0">{f.portion}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
