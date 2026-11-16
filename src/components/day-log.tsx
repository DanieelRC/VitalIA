"use client";
import { useOptimistic, useState, useTransition } from "react";
import { GlassWater, Minus, Plus } from "lucide-react";
import { saveDay } from "@/lib/actions/day";
import { cn } from "./ui";

type Day = { water_glasses: number; satiety: number | null; digestion: number | null; energy: number | null };

const SCALES = [
  { key: "energy" as const, label: "Energía", low: "Sin pila", high: "Con mucha" },
  { key: "satiety" as const, label: "Saciedad", low: "Con hambre", high: "Sin hambre" },
  { key: "digestion" as const, label: "Digestión", low: "Pesada", high: "Ligera" },
];
const GOAL = 8;

/** "Mi día": vasos de agua y cómo te sientes. Se guarda al tocar. */
export function DayLog({ initial }: { initial: Day }) {
  const [day, setDay] = useState(initial);
  const [optimistic, setOptimistic] = useOptimistic(day, (cur: Day, p: Partial<Day>) => ({ ...cur, ...p }));
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const update = (p: Partial<Day>) => start(async () => {
    setOptimistic(p);
    setError(null);
    const res = await saveDay(p as Parameters<typeof saveDay>[0]);
    if (res.error) setError(res.error); else setDay((d) => ({ ...d, ...p }));
  });
  const w = optimistic.water_glasses;

  return (
    <section aria-label="Mi día" className="grid gap-5 rounded-2xl border border-border bg-surface p-5 shadow-soft md:grid-cols-[auto_1fr] md:gap-8">
      <div>
        <h2 className="font-display text-lg font-bold">Mi día</h2>
        <p className="mt-0.5 text-sm text-muted">Agua de hoy</p>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={() => update({ water_glasses: Math.max(0, w - 1) })} disabled={w === 0} aria-label="Quitar un vaso"
            className="grid size-10 place-items-center rounded-full border border-border transition-[background-color,transform] active:scale-90 hover:bg-surface-2 disabled:opacity-40"><Minus className="size-4" /></button>
          <p className="min-w-20 text-center" aria-live="polite">
            <span className="font-display text-4xl font-extrabold tabular">{w}</span><span className="text-sm text-muted"> / {GOAL}</span>
          </p>
          <button type="button" onClick={() => update({ water_glasses: Math.min(30, w + 1) })} aria-label="Agregar un vaso"
            className="grid size-10 place-items-center rounded-full bg-[var(--g-leche)] text-white shadow-soft transition-[filter,transform] active:scale-90 hover:brightness-110"><Plus className="size-4" /></button>
        </div>
        <div className="mt-3 flex gap-1" aria-hidden>
          {Array.from({ length: GOAL }, (_, i) => (
            <GlassWater key={i} className={cn("size-5 transition-[color,transform] duration-300 ease-out-expo", i < w ? "scale-110 text-[var(--g-leche)]" : "text-border")} />
          ))}
        </div>
      </div>

      <div className="grid content-center gap-3">
        {SCALES.map((s) => (
          <div key={s.key} className="grid grid-cols-[5.5rem_1fr] items-center gap-3">
            <span className="text-sm font-medium">{s.label}</span>
            <div role="radiogroup" aria-label={s.label} className="flex items-center gap-1.5">
              <span className="hidden w-20 text-right text-xs text-muted sm:block">{s.low}</span>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = optimistic[s.key] === n;
                return (
                  <button key={n} type="button" role="radio" aria-checked={on} aria-label={`${s.label} ${n} de 5`} onClick={() => update({ [s.key]: n })}
                    className={cn("size-9 rounded-full border text-sm font-semibold tabular transition-[background-color,color,transform,border-color] duration-200 active:scale-90",
                      on ? "border-primary bg-primary text-primary-fg" : "border-border text-muted hover:border-primary/50 hover:bg-primary-soft")}>{n}</button>
                );
              })}
              <span className="hidden w-20 text-xs text-muted sm:block">{s.high}</span>
            </div>
          </div>
        ))}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </div>
    </section>
  );
}
