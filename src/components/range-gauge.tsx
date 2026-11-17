import { zoneOf, type Scale, type Tone } from "@/lib/nutrition";
import { cn } from "./ui";

export const TONE_COLOR: Record<Tone, string> = {
  bajo: "var(--g-leche)", normal: "var(--g-verduras)", limite: "var(--g-cereales)", alto: "var(--g-aoa)",
};
export const TONE_LABEL: Record<Tone, string> = { bajo: "Bajo", normal: "Normal", limite: "Límite", alto: "Alto" };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const fmt = (n: number) => (Math.abs(n) >= 100 ? String(Math.round(n)) : String(Math.round(n * 100) / 100));

/**
 * Regla de rangos: muestra dónde cae un valor respecto a sus zonas (bajo, normal, límite, alto).
 * El color nunca va solo: la zona se nombra junto al valor.
 */
export function RangeGauge({ scale, value, label, hint, compact, className, showValue = true }: {
  scale: Scale; value: number | null | undefined; label?: string; hint?: string; compact?: boolean; className?: string; showValue?: boolean;
}) {
  const has = value != null && Number.isFinite(value);
  const span = scale.max - scale.min || 1;
  const pos = (v: number) => clamp(((v - scale.min) / span) * 100, 0, 100);
  const zone = has ? zoneOf(scale, value!) : null;
  const out = has && (value! < scale.min || value! > scale.max);
  let from = scale.min;
  const bands = scale.zones.map((z) => { const b = { ...z, from, w: pos(z.to) - pos(from) }; from = z.to; return b; });

  return (
    <div className={cn("min-w-0", className)}>
      {(label || has) && (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          {label && <span className={cn("text-muted", compact ? "text-[11px]" : "text-xs")}>{label}</span>}
          {has ? (
            <span className="tabular ml-auto flex items-baseline gap-1.5 text-right">
              {showValue && <strong className={cn("font-display font-bold", compact ? "text-sm" : "text-lg")}>{fmt(value!)}</strong>}
              {showValue && scale.unit && <span className="text-xs text-muted">{scale.unit}</span>}
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: TONE_COLOR[zone!.tone] }}>{zone!.label}</span>
            </span>
          ) : <span className="text-xs text-muted">{showValue ? "sin dato" : "captura el dato para ubicarlo"}</span>}
        </div>
      )}
      <div className="relative" role="img" aria-label={has ? `${label ?? "Valor"}: ${fmt(value!)} ${scale.unit}, ${zone!.label}` : `${label ?? "Valor"}: sin dato`}>
        <div className={cn("flex overflow-hidden rounded-full", compact ? "h-1.5" : "h-2.5")}>
          {bands.map((b, i) => <div key={i} style={{ width: `${b.w}%`, background: TONE_COLOR[b.tone], opacity: zone && zone.label === b.label ? 1 : 0.32 }} className="border-r border-surface last:border-0 transition-opacity duration-300" />)}
        </div>
        {has && (
          <div className="absolute -top-1 transition-[left] duration-300 ease-out-expo" style={{ left: `${pos(value!)}%` }}>
            <div className={cn("-translate-x-1/2 rounded-full border-2 border-surface bg-text shadow-soft", compact ? "size-3.5" : "size-[18px]")} />
            {out && <span className="absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold text-danger">fuera de escala</span>}
          </div>
        )}
      </div>
      {!compact && (
        <div className="relative mt-1 h-3.5 text-[10px] text-muted tabular">
          {bands.slice(0, -1).filter((b, i, l) => i === 0 || pos(b.to) - pos(l[i - 1].to) >= 9).map((b, i) => <span key={i} className="absolute -translate-x-1/2" style={{ left: `${pos(b.to)}%` }}>{fmt(b.to)}</span>)}
        </div>
      )}
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/** Escala de adecuación (obtenido ÷ meta): aceptable 95–105 %. */
export const ADEQUACY_SCALE: Scale = {
  min: 60, max: 140, unit: "%", zones: [
    { to: 90, label: "Falta", tone: "bajo" }, { to: 95, label: "Casi", tone: "limite" }, { to: 105, label: "Adecuado", tone: "normal" },
    { to: 110, label: "Pasado", tone: "limite" }, { to: 140, label: "Excede", tone: "alto" },
  ],
};
