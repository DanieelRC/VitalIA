import type { ReactNode } from "react";
import type { Scale } from "@/lib/nutrition";
import { RangeGauge } from "./range-gauge";
import { cn } from "./ui";

/** Fracción en línea con tipografía matemática. */
export function Frac({ n, d }: { n: ReactNode; d: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex flex-col items-center align-middle text-[0.92em] leading-tight">
      <span className="border-b border-current px-1">{n}</span><span className="px-1">{d}</span>
    </span>
  );
}

/** Renglón de fórmula: siempre en tipografía matemática, nunca como texto corrido. */
export function Formula({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("formula formula-block", className)}>{children}</p>;
}

/**
 * Un resultado con su fórmula a la vista: nombre, cifra grande, la fórmula con los valores sustituidos
 * y (si aplica) la regla de rangos que dice si es normal, límite o atípico.
 */
export function FormulaCard({ title, value, unit, formula, scale, hint, tag, className }: {
  title: string; value: number | string | null; unit?: string; formula?: ReactNode; scale?: Scale; hint?: ReactNode; tag?: string; className?: string;
}) {
  const num = typeof value === "number" && Number.isFinite(value) ? value : null;
  const empty = value == null || (typeof value === "number" && !Number.isFinite(value));
  return (
    <article className={cn("flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-4", className)}>
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-muted">{title}{tag && <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold">{tag}</span>}</h3>
        <p className="tabular whitespace-nowrap font-display text-2xl font-extrabold tracking-tight">
          {empty ? <span className="text-muted/50">—</span> : value}{!empty && unit && <span className="ml-1 text-xs font-semibold text-muted">{unit}</span>}
        </p>
      </header>
      {scale && <RangeGauge scale={scale} value={num} showValue={false} />}
      {formula && <Formula className="text-[13px]">{formula}</Formula>}
      {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
    </article>
  );
}
