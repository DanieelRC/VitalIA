import { Card, LinkButton, PageHeader } from "@/components/ui";
import { DEFAULT_RANGES, macroPresets, mealDistributionPresets } from "@/lib/nutrition";
import { createClient, requireRole } from "@/lib/supabase/server";
import { Calculator } from "./calculator";

export const metadata = { title: "Calculadora y fórmulas" };

/** Formulario de consulta rápida: nombre de la fórmula, la ecuación y cuándo usarla. */
const REF: { title: string; color: string; items: [name: string, formula: string, note?: string][] }[] = [
  { title: "Antropometría", color: "var(--g-verduras)", items: [
    ["Índice de masa corporal", "IMC = peso ÷ talla²", "kg y metros"],
    ["Peso ideal · Lorentz", "H: T − 100 − (T − 150) ÷ 4   ·   M: T − 100 − (T − 150) ÷ 2", "talla en cm"],
    ["Peso ideal · Hamwi", "H: 48 + 2.7 × pulgadas sobre 152.4 cm   ·   M: 45.5 + 2.2 × pulgadas"],
    ["Peso ajustado", "PAj = PI + 0.25 × (PA − PI)", "obesidad"],
    ["Índices de cintura", "ICC = cintura ÷ cadera   ·   ICE = cintura ÷ talla"],
    ["Complexión", "r = talla ÷ circunferencia de muñeca"],
    ["Densidad · Durnin-Womersley", "D = c − m × log₁₀(Σ4 pliegues)", "bíceps, tríceps, subescapular, suprailiaco"],
    ["% de grasa", "Siri: (4.95 ÷ D − 4.50) × 100   ·   Brozek: (4.57 ÷ D − 4.142) × 100"],
    ["Slaughter (8–18 años)", "H: 0.735 × (T + P) + 1.0   ·   M: 0.610 × (T + P) + 5.1", "tríceps + pantorrilla"],
    ["Masa muscular · Lee", "MME = talla × (0.00744·CAG² + 0.00088·CMG² + 0.00441·CPG²) + 2.4·sexo − 0.048·edad + raza + 7.8"],
    ["Área muscular de brazo", "AMB = (CB − π × PCT)² ÷ 4π − 10 (H) o − 6.5 (M)"],
  ] },
  { title: "Gasto energético", color: "var(--g-cereales)", items: [
    ["Harris-Benedict", "H: 66.47 + 13.75·P + 5.00·T − 6.75·E   ·   M: 655.1 + 9.56·P + 1.85·T − 4.68·E"],
    ["Mifflin-St Jeor", "10·P + 6.25·T − 5·E + 5 (H) o − 161 (M)"],
    ["Valencia (población mexicana)", "H 18–30: 13.37·P + 747 · 30–60: 13.08·P + 693 · >60: 14.21·P + 429", "M: 11.02·P + 679 · 10.92·P + 677 · 10.98·P + 520"],
    ["Owen", "H: 879 + 10.2·P   ·   M: 795 + 7.18·P"],
    ["Con masa libre de grasa", "Katch-McArdle: 370 + 21.6·MLG   ·   Cunningham: 500 + 22·MLG"],
    ["FAO/OMS y Schofield", "a·P + b", "coeficientes por sexo y grupo de edad"],
    ["Gasto energético total", "GET = GEB × FA × FE + ETA", "ETA ≈ 10 % del GEB"],
  ] },
  { title: "Ejercicio", color: "var(--g-aoa)", items: [
    ["Frecuencia cardiaca máxima", "Tanaka: 208 − 0.7 × edad   ·   Fox: 220 − edad"],
    ["Karvonen", "FC objetivo = FC reposo + % × (FC máx − FC reposo)"],
    ["Gasto por actividad", "kcal = MET × 3.5 × peso ÷ 200 × minutos"],
    ["1RM", "Epley: carga × (1 + reps ÷ 30)   ·   Brzycki: carga × 36 ÷ (37 − reps)"],
  ] },
  { title: "Clínica y deporte", color: "var(--g-leche)", items: [
    ["Somatotipo · Heath-Carter", "X = ecto − endo   ·   Y = 2·meso − (endo + ecto)", "coordenadas de la somatocarta"],
    ["Embarazo (IOM 2009)", "Ganancia total: 12.5–18 · 11.5–16 · 7–11.5 · 5–9 kg", "bajo peso · normal · sobrepeso · obesidad"],
    ["Energía en el embarazo", "+0 · +340 · +452 kcal/día", "por trimestre"],
    ["Deportista (ISSN / ACSM)", "HC 3–12 g/kg   ·   proteína 1.4–2.2 g/kg   ·   lípidos 0.8–1.5 g/kg"],
    ["Agua", "30–35 ml × kg de peso"],
  ] },
];

export default async function Formulas() {
  await requireRole("nutriologo");
  const supabase = await createClient();
  const [formulas, factors, presets] = await Promise.all([
    supabase.from("custom_formulas").select("id, name, expression").order("name"),
    supabase.from("custom_factors").select("id, kind, label, value").order("value"),
    supabase.from("macro_presets").select("id, name, protein_pct, fat_pct, carbs_pct, note").order("name"),
  ]);
  const R = DEFAULT_RANGES.pct;
  return (
    <>
      <PageHeader title="Calculadora y fórmulas" subtitle="Cálculos rápidos sin abrir un expediente. Cada cifra muestra su fórmula y dónde cae en el rango."
        actions={<LinkButton href="/consultorio/personalizar" size="sm">Mis fórmulas y factores</LinkButton>} />
      <Calculator config={{
        formulas: formulas.data ?? [],
        factors: (factors.data ?? []) as { id: string; kind: "actividad" | "estres"; label: string; value: number }[],
        macroPresets: (presets.data ?? []).map((p) => ({ ...p, protein_pct: Number(p.protein_pct), fat_pct: Number(p.fat_pct), carbs_pct: Number(p.carbs_pct) })),
      }} />

      <h2 className="mb-3 mt-10 font-display text-2xl font-extrabold tracking-tight">Formulario</h2>
      <div className="grid gap-3">
        {REF.map((sec, i) => (
          <details key={sec.title} open={i === 0} className="group rounded-2xl border border-border bg-surface shadow-soft">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="size-3 rounded-full" style={{ background: sec.color }} aria-hidden />
              <span className="font-display text-lg font-bold">{sec.title}</span>
              <span className="text-xs text-muted">{sec.items.length} fórmulas</span>
              <span className="ml-auto text-muted transition-transform group-open:rotate-90" aria-hidden>›</span>
            </summary>
            <dl className="grid gap-x-6 gap-y-3 border-t border-border p-4 md:grid-cols-2">
              {sec.items.map(([name, formula, note]) => (
                <div key={name}>
                  <dt className="mb-1 text-sm font-semibold">{name}</dt>
                  <dd><p className="formula formula-block text-[13px]" style={{ borderLeftColor: sec.color }}>{formula}</p>{note && <p className="mt-1 text-xs text-muted">{note}</p>}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Distribuciones de macronutrientes tipo">
          <ul className="grid gap-2.5">
            {macroPresets.map((p) => {
              const out = p.pct.protein_pct < R.protein.low || p.pct.protein_pct > R.protein.high || p.pct.fat_pct < R.fat.low || p.pct.fat_pct > R.fat.high || p.pct.carbs_pct < R.carbs.low || p.pct.carbs_pct > R.carbs.high;
              return (
                <li key={p.key}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{p.label}{out && <span className="ml-1.5 rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn">terapéutica</span>}</span>
                    <span className="tabular text-xs text-muted">P {p.pct.protein_pct} · L {p.pct.fat_pct} · HC {p.pct.carbs_pct} %</span>
                  </div>
                  <div className="mt-1 flex h-2.5 overflow-hidden rounded-full" role="img" aria-label={`Proteína ${p.pct.protein_pct} %, lípidos ${p.pct.fat_pct} %, hidratos ${p.pct.carbs_pct} %`}>
                    <span style={{ width: `${p.pct.protein_pct}%`, background: "var(--g-aoa)" }} /><span style={{ width: `${p.pct.fat_pct}%`, background: "var(--g-grasas)" }} /><span style={{ width: `${p.pct.carbs_pct}%`, background: "var(--g-cereales)" }} />
                  </div>
                  {p.note && <p className="mt-0.5 text-xs text-muted">{p.note}</p>}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Energía por tiempos de comida">
          <ul className="grid gap-3">
            {mealDistributionPresets.map((d) => (
              <li key={d.key}>
                <p className="mb-1 text-sm font-medium">{d.label}</p>
                <div className="flex h-7 gap-0.5 overflow-hidden rounded-lg text-[10px] font-semibold text-white">
                  {d.meals.map((m, i) => <span key={i} title={`${m.name} ${m.kcal_pct} %`} className="grid place-items-center overflow-hidden bg-field" style={{ width: `${m.kcal_pct}%`, opacity: 0.55 + m.kcal_pct / 90 }}>{m.kcal_pct}%</span>)}
                </div>
                <p className="mt-1 text-xs text-muted">{d.meals.map((m) => m.name).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
