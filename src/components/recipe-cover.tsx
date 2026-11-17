import { plateSegments, familyColor } from "@/lib/groups";
import { cn } from "./ui";

const MEAL_BG: Record<string, [string, string]> = {
  desayuno: ["#fbe9b0", "#f5c84b"], colacion: ["#dff0b8", "#a8cf52"], comida: ["#cfe9d6", "#4fae72"], cena: ["#cfdcf0", "#5a86c4"],
};

/**
 * Portada de una receta. Si el nutriólogo subió una foto del platillo, se muestra; si no, una ilustración
 * generada con los grupos de alimentos de la receta (nunca fotos ajenas).
 */
export function RecipeCover({ name, mealTime, equivalents, src, className, rounded = true }: {
  name: string; mealTime: string; equivalents?: Record<string, number> | null; src?: string | null; className?: string; rounded?: boolean;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={`Foto de ${name}`} loading="lazy" className={cn("aspect-[4/3] w-full object-cover", rounded && "rounded-xl", className)} />;
  }
  const [a, b] = MEAL_BG[mealTime] ?? MEAL_BG.comida;
  const segs = plateSegments(equivalents ?? {});
  const total = segs.reduce((s, x) => s + x.value, 0);
  let angle = -90;
  const arc = (from: number, to: number, r: number) => {
    const p = (deg: number) => [100 + r * Math.cos((deg * Math.PI) / 180), 75 + r * Math.sin((deg * Math.PI) / 180)];
    const [x1, y1] = p(from), [x2, y2] = p(to);
    return `M 100 75 L ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
  };
  return (
    <svg viewBox="0 0 200 150" role="img" aria-label={`Ilustración de ${name}`} className={cn("aspect-[4/3] w-full", rounded && "rounded-xl", className)} preserveAspectRatio="xMidYMid slice">
      <rect width="200" height="150" fill={a} />
      <circle cx="30" cy="20" r="46" fill={b} opacity="0.35" />
      <circle cx="182" cy="140" r="52" fill={b} opacity="0.3" />
      {/* cubiertos */}
      <rect x="33" y="38" width="4" height="78" rx="2" fill="#fff" opacity="0.75" />
      <path d="M27 38 v22 a8 8 0 0 0 16 0 v-22" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.75" />
      <path d="M165 116 V40 c9 6 11 22 6 38 l-2 4" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
      {/* plato */}
      <ellipse cx="100" cy="82" rx="54" ry="52" fill="#000" opacity="0.08" />
      <circle cx="100" cy="75" r="52" fill="#fff" />
      <circle cx="100" cy="75" r="43" fill="#f4f1ea" />
      {total > 0 && segs.length === 1 && <circle cx="100" cy="75" r="38" fill={familyColor(segs[0].family)} />}
      {total > 0 && segs.length > 1 && segs.map((s) => {
        const from = angle, to = angle + (s.value / total) * 360;
        angle = to;
        return <path key={s.family} d={arc(from, to, 38)} fill={familyColor(s.family)} stroke="#f4f1ea" strokeWidth="2" />;
      })}
      {total === 0 && <circle cx="100" cy="75" r="30" fill={b} opacity="0.5" />}
      <circle cx="100" cy="75" r="9" fill="#f4f1ea" />
    </svg>
  );
}
