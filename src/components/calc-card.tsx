import { Calculator, PenLine, TriangleAlert } from "lucide-react";
import { CopilotAction } from "./copilot-action";
import type { CalcResult } from "@/lib/ai/calc";
import { cn } from "./ui";

const TONE = {
  normal: { dot: "bg-[var(--g-verduras)]", text: "Normal" },
  bajo: { dot: "bg-[var(--g-leche)]", text: "Bajo" },
  limite: { dot: "bg-[var(--g-cereales)]", text: "Límite" },
  alto: { dot: "bg-[var(--g-aoa)]", text: "Alto" },
} as const;

/** Resultado exacto de una herramienta de cálculo: datos usados, fórmula y cifras. No lo redacta el modelo. */
export function CalcCard({ card, patientId }: { card: CalcResult; patientId?: string }) {
  const draft = !!card.accion;
  return (
    <section className="animate-enter overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
      <header className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
        {draft ? <PenLine className="size-4 shrink-0 text-primary" aria-hidden /> : <Calculator className="size-4 shrink-0 text-primary" aria-hidden />}
        <h4 className="font-display text-sm font-semibold">{card.titulo}</h4>
        <span className="ml-auto rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{draft ? "Borrador" : "Cálculo exacto"}</span>
      </header>
      <div className="space-y-3 p-3">
        {card.datos.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Datos usados">
            {card.datos.map((d, i) => <li key={i} className="tabular rounded-md border border-border px-2 py-0.5 text-xs text-muted">{d}</li>)}
          </ul>
        )}
        {card.formula && card.formula.length > 0 && (
          <div className="formula-block space-y-1">
            {card.formula.map((f, i) => <p key={i} className="formula text-[13px]">{f}</p>)}
          </div>
        )}
        {card.texto?.map((t, i) => (
          <div key={i}>
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t.titulo}</h5>
            <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{t.cuerpo}</p>
          </div>
        ))}
        {card.resultados.length > 0 && (
          <dl className="divide-y divide-border">
            {card.resultados.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 py-1.5">
                <dt className="text-xs text-muted">{r.etiqueta}</dt>
                <dd className="tabular flex items-center gap-1.5 text-right text-sm font-semibold">
                  {r.estado && <span className={cn("size-2 shrink-0 rounded-full", TONE[r.estado].dot)} title={TONE[r.estado].text} />}
                  <span>{r.valor}</span>
                  {r.estado && <span className="sr-only">({TONE[r.estado].text})</span>}
                </dd>
                {r.nota && <p className="col-span-2 text-[11px] text-muted">{r.nota}</p>}
              </div>
            ))}
          </dl>
        )}
        {card.avisos && card.avisos.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-warn-soft px-2.5 py-2 text-xs text-warn">
            {card.avisos.map((a, i) => <li key={i} className="flex gap-1.5"><TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />{a}</li>)}
          </ul>
        )}
        {card.accion && patientId && <CopilotAction patientId={patientId} action={card.accion} />}
      </div>
    </section>
  );
}

export const isCalcResult = (v: unknown): v is CalcResult =>
  !!v && typeof v === "object" && typeof (v as CalcResult).titulo === "string" && Array.isArray((v as CalcResult).resultados);
