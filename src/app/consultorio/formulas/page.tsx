import { Card, PageHeader } from "@/components/ui";
import { macroPresets, mealDistributionPresets } from "@/lib/nutrition";
import { Calculator } from "./calculator";

export const metadata = { title: "Fórmulas" };

const REF: [string, string[]][] = [
  ["Antropometría", [
    "IMC = peso (kg) / talla² (m)",
    "Peso ideal Lorentz: H = T − 100 − (T − 150)/4 · M = T − 100 − (T − 150)/2",
    "Hamwi: H 48 kg + 2.7 kg por pulgada > 152.4 cm · M 45.5 + 2.2",
    "Peso ajustado = PI + 0.25 × (PA − PI)",
    "ICC = cintura / cadera · ICE = cintura / talla · Complexión = talla / muñeca",
    "Durnin-Womersley: D = c − m × log10(Σ4 pliegues) · Siri %G = (4.95/D − 4.50) × 100 · Brozek %G = (4.57/D − 4.142) × 100",
    "Jackson-Pollock 3 y 7 pliegues (ecuaciones por sexo con edad)",
    "Slaughter (8-18 años): H 0.735(T+P) + 1.0 · M 0.610(T+P) + 5.1",
    "Masa muscular Lee: Ht × (0.00744 CAG² + 0.00088 CMG² + 0.00441 CPG²) + 2.4 sexo − 0.048 edad + raza + 7.8",
    "AMB = (CB − π × PCT)² / 4π − 10 (H) / − 6.5 (M)",
  ]],
  ["Gasto energético basal", [
    "Harris-Benedict H: 66.47 + 13.75P + 5.00T − 6.75E · M: 655.1 + 9.56P + 1.85T − 4.68E",
    "Mifflin-St Jeor: 10P + 6.25T − 5E + 5 (H) / − 161 (M)",
    "FAO/OMS y Schofield: ecuaciones por sexo y grupo de edad con peso",
    "Valencia (mexicanos): H 18-30 13.37P + 747 · 30-60 13.08P + 693 · >60 14.21P + 429; M 11.02P + 679 · 10.92P + 677 · 10.98P + 520",
    "Owen H: 879 + 10.2P · M: 795 + 7.18P",
    "Katch-McArdle: 370 + 21.6 MLG · Cunningham: 500 + 22 MLG",
    "GET = GEB × FA × FE + ETA (≈10 %)",
  ]],
  ["Ejercicio", [
    "FCmáx Tanaka = 208 − 0.7 × edad · Fox = 220 − edad",
    "Karvonen: FC objetivo = (FCmáx − FCrep) × % + FCrep",
    "kcal = MET × 3.5 × peso / 200 × minutos",
    "1RM Epley = carga × (1 + reps/30) · Brzycki = carga × 36 / (37 − reps)",
  ]],
];

export default function Formulas() {
  return (
    <>
      <PageHeader title="Calculadora y fórmulas" subtitle="Cálculos rápidos sin necesidad de expediente." />
      <Calculator />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {REF.map(([t, list]) => (
          <Card key={t} title={t}><ul className="list-disc space-y-1 pl-5 text-sm">{list.map((x) => <li key={x}>{x}</li>)}</ul></Card>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Distribuciones de macronutrientes">
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th>Tipo</th><th>P</th><th>L</th><th>HC</th></tr></thead>
            <tbody className="divide-y divide-border">{macroPresets.map((p) => (
              <tr key={p.key}><td className="py-1">{p.label}{p.note && <span className="block text-xs text-muted">{p.note}</span>}</td><td>{p.pct.protein_pct}%</td><td>{p.pct.fat_pct}%</td><td>{p.pct.carbs_pct}%</td></tr>
            ))}</tbody></table>
        </Card>
        <Card title="Distribución de energía por tiempos de comida">
          <ul className="text-sm">{mealDistributionPresets.map((d) => (
            <li key={d.key} className="py-1"><strong>{d.label}:</strong> {d.meals.map((m) => `${m.name} ${m.kcal_pct}%`).join(" · ")}</li>
          ))}</ul>
        </Card>
      </div>
    </>
  );
}
