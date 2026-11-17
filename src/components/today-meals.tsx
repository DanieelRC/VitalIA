"use client";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Check, Repeat, Undo2, X } from "lucide-react";
import { checkMeal, swapMeal } from "@/lib/actions/day";
import { FAMILY_LABEL, FAMILY_ORDER, familyColor, plateSegments, type GroupFamily } from "@/lib/groups";
import { Plate } from "./plate";
import { RecipeCover } from "./recipe-cover";
import { cn } from "./ui";

export type TodayMeal = {
  index: number; name: string; equivalents: Record<string, number>;
  dish: { recipeId: string | null; name: string; cover: string | null; mealTime: string; equivalents: Record<string, number> | null; swapped: boolean } | null;
  done: boolean;
  options: { id: string; name: string; kcal: number | null; cover: string | null; mealTime: string; equivalents: Record<string, number> }[];
};

/**
 * "Hoy te toca": cada comida se marca como hecha con un toque y el platillo se puede cambiar por otra
 * receta parecida. Arriba se ve cuánto del día llevas y qué grupos de alimentos te faltan.
 */
export function TodayMeals({ meals: initial, planName, kcal }: { meals: TodayMeal[]; planName: string; kcal: number }) {
  const [meals, setMeals] = useState(initial);
  const [optimistic, patch] = useOptimistic(meals, (cur: TodayMeal[], p: { index: number; done?: boolean; dish?: TodayMeal["dish"] }) =>
    cur.map((m) => (m.index === p.index ? { ...m, ...(p.done != null ? { done: p.done } : {}), ...(p.dish !== undefined ? { dish: p.dish } : {}) } : m)));
  const [, start] = useTransition();
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (m: TodayMeal) => start(async () => {
    patch({ index: m.index, done: !m.done });
    setError(null);
    const r = await checkMeal(m.index, !m.done);
    if (r.error) setError(r.error); else setMeals((l) => l.map((x) => (x.index === m.index ? { ...x, done: !m.done } : x)));
  });
  const swap = (m: TodayMeal, opt: TodayMeal["options"][number] | null) => start(async () => {
    const dish = opt ? { recipeId: opt.id, name: opt.name, cover: opt.cover, mealTime: opt.mealTime, equivalents: opt.equivalents, swapped: true } : m.dish;
    if (opt) patch({ index: m.index, dish });
    setOpen(null);
    setError(null);
    const r = await swapMeal(m.index, opt?.id ?? null);
    if (r.error) setError(r.error);
    else if (opt) setMeals((l) => l.map((x) => (x.index === m.index ? { ...x, dish } : x)));
    else window.location.reload(); // volver al platillo original del plan
  });

  const done = optimistic.filter((m) => m.done).length;
  const sum = (list: TodayMeal[]) => {
    const t = new Map<GroupFamily, number>();
    for (const m of list) for (const s of plateSegments(m.equivalents)) t.set(s.family, (t.get(s.family) ?? 0) + s.value);
    return t;
  };
  const total = sum(optimistic), eaten = sum(optimistic.filter((m) => m.done));
  const families = FAMILY_ORDER.filter((f) => (total.get(f) ?? 0) > 0);
  const pct = optimistic.length ? Math.round((done / optimistic.length) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-3xl bg-field text-field-fg shadow-lift">
      <div className="flex flex-wrap items-center gap-5 px-5 pt-5 sm:px-7 sm:pt-7">
        <div className="relative grid size-20 shrink-0 place-items-center" role="img" aria-label={`${done} de ${optimistic.length} comidas hechas hoy`}>
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--field-2)" strokeWidth="3.5" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--g-frutas)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} style={{ transition: "stroke-dasharray .5s var(--ease-out)" }} />
          </svg>
          <p className="tabular font-display text-2xl font-extrabold leading-none">{done}<span className="text-sm font-semibold text-field-muted">/{optimistic.length}</span></p>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold tracking-tight">{done === 0 ? "Hoy te toca" : done === optimistic.length ? "¡Día completo!" : "Así va tu día"}</h2>
          <p className="mt-0.5 text-sm text-field-muted">{planName} · {Math.round(kcal)} kcal al día</p>
        </div>
        <Link href="/portal/mi-plan" className="rounded-full bg-field-2 px-4 py-2 text-sm font-semibold transition-colors hover:bg-field-fg hover:text-field">Ver mi plan</Link>
      </div>

      {families.length > 0 && (
        <ul className="mt-5 grid gap-x-6 gap-y-2.5 px-5 sm:grid-cols-2 sm:px-7 lg:grid-cols-3" aria-label="Equivalentes del día por grupo">
          {families.map((f) => {
            const t = total.get(f) ?? 0, e = eaten.get(f) ?? 0;
            return (
              <li key={f}>
                <div className="flex items-baseline justify-between text-xs"><span className="text-field-muted">{FAMILY_LABEL[f]}</span><span className="tabular"><b>{e}</b> de {t}{e < t ? <span className="text-field-muted"> · faltan {Math.round((t - e) * 10) / 10}</span> : " ✓"}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-field-2"><div className="h-full rounded-full transition-[width] duration-500 ease-out-expo" style={{ width: `${t ? (e / t) * 100 : 0}%`, background: familyColor(f) }} /></div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="mx-5 mt-4 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger sm:mx-7" role="alert">{error}</p>}

      <ol className="mt-5 grid gap-px bg-field-2 sm:grid-cols-2 lg:grid-cols-3">
        {optimistic.map((m) => (
          <li key={m.index} className={cn("flex flex-col gap-3 bg-field p-5 transition-opacity sm:px-6", m.done && "opacity-75")}>
            <div className="flex gap-3">
              {m.dish
                ? <div className="w-24 shrink-0"><RecipeCover name={m.dish.name} mealTime={m.dish.mealTime} equivalents={m.dish.equivalents ?? m.equivalents} src={m.dish.cover} /></div>
                : <Plate segments={plateSegments(m.equivalents)} size={72} animate={false} />}
              <div className="min-w-0 flex-1">
                <p className={cn("font-display text-lg font-bold leading-tight", m.done && "line-through decoration-field-muted")}>{m.name}</p>
                {m.dish && (
                  <p className="mt-0.5 text-sm">
                    {m.dish.recipeId ? <Link className="underline decoration-field-muted/60 hover:decoration-field-fg" href={`/portal/recetas/${m.dish.recipeId}`}>{m.dish.name}</Link> : m.dish.name}
                    {m.dish.swapped && <span className="ml-1.5 rounded bg-field-2 px-1.5 py-0.5 text-[10px] font-semibold text-field-muted">cambio de hoy</span>}
                  </p>
                )}
                <ul className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-field-muted">
                  {plateSegments(m.equivalents).map((s) => <li key={s.family} className="flex items-center gap-1"><span aria-hidden className="size-2 rounded-full" style={{ background: familyColor(s.family) }} /><b className="tabular text-field-fg">{s.value}</b> {FAMILY_LABEL[s.family]}</li>)}
                </ul>
              </div>
            </div>
            <div className="mt-auto flex gap-2">
              <button type="button" onClick={() => toggle(m)} aria-pressed={m.done}
                className={cn("flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-[background-color,transform] active:scale-[0.97]", m.done ? "bg-field-2 text-field-fg" : "bg-[var(--g-frutas)] text-[#16300a] hover:brightness-110")}>
                {m.done ? <><Undo2 className="size-4" />Desmarcar</> : <><Check className="size-4" />Ya comí</>}
              </button>
              {m.options.length > 0 && !m.done && (
                <button type="button" onClick={() => setOpen(open === m.index ? null : m.index)} aria-expanded={open === m.index} aria-label={`Cambiar el platillo de ${m.name}`}
                  className="flex h-10 items-center gap-1.5 rounded-full border border-field-2 px-3.5 text-sm font-semibold hover:bg-field-2"><Repeat className="size-4" />Cambiar</button>
              )}
            </div>
            {open === m.index && (
              <div className="rounded-2xl bg-field-2 p-2.5">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <p className="text-xs font-semibold">Opciones parecidas para hoy</p>
                  <button type="button" onClick={() => setOpen(null)} aria-label="Cerrar" className="grid size-6 place-items-center rounded-full hover:bg-field"><X className="size-3.5" /></button>
                </div>
                <ul className="grid gap-1">
                  {m.options.map((o) => (
                    <li key={o.id}>
                      <button type="button" onClick={() => swap(m, o)} className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left text-sm hover:bg-field">
                        <span className="w-12 shrink-0"><RecipeCover name={o.name} mealTime={o.mealTime} equivalents={o.equivalents} src={o.cover} /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{o.name}</span>{o.kcal != null && <span className="tabular text-xs text-field-muted">{Math.round(o.kcal)} kcal</span>}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {m.dish?.swapped && <button type="button" onClick={() => swap(m, null)} className="mt-1.5 w-full rounded-xl px-2 py-1.5 text-left text-xs text-field-muted underline hover:text-field-fg">Volver al platillo de mi plan</button>}
                <p className="mt-1.5 px-1 text-[11px] text-field-muted">El cambio es solo por hoy; tu nutriólogo lo verá.</p>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
