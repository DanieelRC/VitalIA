import { FAMILY_LABEL, familyColor, groupColor, type GroupFamily } from "@/lib/groups";
import { cn } from "./ui";

const pt = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
};

/**
 * Un plato: cada sector es una familia de alimentos, con el tamaño de sus equivalentes.
 * Es la firma visual de VitalIA y se "sirve" con un barrido al aparecer.
 */
export function Plate({ segments, size = 72, className, animate = true, label }: {
  segments: { family: GroupFamily; value: number }[]; size?: number; className?: string; animate?: boolean; label?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const desc = label ?? (total ? segments.map((s) => `${FAMILY_LABEL[s.family]} ${s.value}`).join(", ") : "Plato vacío");
  let angle = 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={desc} className={cn("shrink-0", className)}>
      <circle cx="50" cy="50" r="48" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
      <g className={animate ? "plate-serve" : undefined} style={{ transformOrigin: "50% 50%" }}>
        {total === 0 && <circle cx="50" cy="50" r="38" fill="var(--surface-2)" />}
        {segments.length === 1 && total > 0 && <circle cx="50" cy="50" r="38" fill={familyColor(segments[0].family)} />}
        {segments.length > 1 && segments.map((s) => {
          const start = angle;
          const sweep = (s.value / total) * 360;
          angle += sweep;
          return (
            <path key={s.family} fill={familyColor(s.family)} stroke="var(--surface)" strokeWidth="1.6" strokeLinejoin="round"
              d={`M50 50 L${pt(38, start)} A38 38 0 ${sweep > 180 ? 1 : 0} 1 ${pt(38, start + sweep)} Z`} />
          );
        })}
      </g>
    </svg>
  );
}

/** Punto de color + nombre de un grupo de equivalentes. */
export function GroupDot({ code, className }: { code: string | null | undefined; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: groupColor(code) }} />;
}

/** Barra apilada de macronutrientes (proteína, lípidos, hidratos) en gramos → % de energía. */
export function MacroBar({ protein, fat, carbs, className }: { protein: number; fat: number; carbs: number; className?: string }) {
  const parts = [
    { key: "Proteína", g: protein, kcal: protein * 4, color: "var(--g-aoa)" },
    { key: "Lípidos", g: fat, kcal: fat * 9, color: "var(--g-grasas)" },
    { key: "Hidratos", g: carbs, kcal: carbs * 4, color: "var(--g-cereales)" },
  ];
  const total = parts.reduce((a, p) => a + p.kcal, 0) || 1;
  return (
    <div className={className}>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" role="img"
        aria-label={parts.map((p) => `${p.key} ${Math.round((p.kcal / total) * 100)} %`).join(", ")}>
        {parts.map((p) => <div key={p.key} style={{ width: `${(p.kcal / total) * 100}%`, background: p.color }} className="first:rounded-l-full last:rounded-r-full" />)}
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
        {parts.map((p) => (
          <div key={p.key}>
            <dt className="flex items-center gap-1.5 text-xs text-muted"><span className="size-2 rounded-full" style={{ background: p.color }} />{p.key}</dt>
            <dd className="tabular font-semibold">{Math.round(p.g)} g <span className="text-xs font-normal text-muted">{Math.round((p.kcal / total) * 100)} %</span></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Marca: el plato en tres tercios. */
export function PlateMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className={className}>
      <circle cx="50" cy="50" r="48" fill="#fff" />
      <path d={`M50 50 L${pt(40, 0)} A40 40 0 0 1 ${pt(40, 120)} Z`} fill="#f0b400" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
      <path d={`M50 50 L${pt(40, 120)} A40 40 0 0 1 ${pt(40, 240)} Z`} fill="#d63c2c" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
      <path d={`M50 50 L${pt(40, 240)} A40 40 0 0 1 ${pt(40, 360)} Z`} fill="#2b9a4b" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("font-display text-lg font-extrabold tracking-tight", className)}>Vital<span className="opacity-70">IA</span></span>;
}
