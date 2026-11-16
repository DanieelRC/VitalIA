"use client";
import { useState } from "react";
import { Card, Field, Input, Select } from "@/components/ui";
import {
  activityFactors, adjustedWeight, basalEnergy, bmi, bmiCategory, brozek, durninWomersleyDensity, energyFormulas, heartRateZones,
  idealWeight, jacksonPollock3Density, macroPresets, macrosFromPct, maxHeartRate, metKcal, oneRepMaxBrzycki, oneRepMaxEpley, siri,
  totalEnergy, type EnergyFormula, type Sex,
} from "@/lib/nutrition";

const n = (v: string) => Number(v.replace(",", ".")) || 0;

export function Calculator() {
  const [sex, setSex] = useState<Sex>("F");
  const [w, setW] = useState("70"); const [h, setH] = useState("165"); const [age, setAge] = useState("30");
  const [lean, setLean] = useState(""); const [fa, setFa] = useState("1.375");
  const [folds, setFolds] = useState({ b: "", t: "", sub: "", sup: "", x1: "", x2: "", x3: "" });
  const [rest, setRest] = useState("65"); const [met, setMet] = useState("5"); const [min, setMin] = useState("30");
  const [rmW, setRmW] = useState("60"); const [rmR, setRmR] = useState("8");
  const [kcal, setKcal] = useState("1800"); const [preset, setPreset] = useState("equilibrada");

  const input = { weightKg: n(w), heightCm: n(h), age: n(age), sex, leanKg: n(lean) || undefined };
  const imc = n(w) && n(h) ? bmi(n(w), n(h)) : 0;
  const pi = idealWeight.lorentz(n(h), sex);
  const dw = [folds.b, folds.t, folds.sub, folds.sup].every((x) => n(x)) ? durninWomersleyDensity(n(folds.b) + n(folds.t) + n(folds.sub) + n(folds.sup), n(age), sex) : 0;
  const jp = [folds.x1, folds.x2, folds.x3].every((x) => n(x)) ? jacksonPollock3Density(n(folds.x1) + n(folds.x2) + n(folds.x3), n(age), sex) : 0;
  const fcmax = maxHeartRate.tanaka(n(age));
  const p = macroPresets.find((x) => x.key === preset)!;
  const m = macrosFromPct(n(kcal), p.pct);

  return (
    <div className="grid gap-4">
      <Card title="Datos">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Field label="Sexo"><Select value={sex} onChange={(e) => setSex(e.target.value as Sex)}><option value="F">Femenino</option><option value="M">Masculino</option></Select></Field>
          <Field label="Peso (kg)"><Input value={w} onChange={(e) => setW(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Talla (cm)"><Input value={h} onChange={(e) => setH(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Edad"><Input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" /></Field>
          <Field label="MLG (kg)"><Input value={lean} onChange={(e) => setLean(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Actividad"><Select value={fa} onChange={(e) => setFa(e.target.value)}>{activityFactors.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select></Field>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Antropometría">
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <dt>IMC</dt><dd className="font-semibold">{imc || "—"} {imc ? `· ${bmiCategory(imc)}` : ""}</dd>
            <dt>Peso ideal Lorentz</dt><dd>{pi} kg</dd>
            <dt>Peso ideal Hamwi</dt><dd>{idealWeight.hamwi(n(h), sex)} kg</dd>
            <dt>Peso ideal Robinson</dt><dd>{idealWeight.robinson(n(h), sex)} kg</dd>
            <dt>Peso ideal Devine</dt><dd>{idealWeight.devine(n(h), sex)} kg</dd>
            <dt>Peso para IMC 22</dt><dd>{idealWeight.bmiTarget(n(h))} kg</dd>
            <dt>Peso ajustado (obesidad)</dt><dd>{adjustedWeight(n(w), pi)} kg</dd>
          </dl>
        </Card>
        <Card title="Gasto energético basal">
          <table className="w-full text-sm"><tbody className="divide-y divide-border">
            {Object.keys(energyFormulas).map((k) => {
              const geb = basalEnergy(k as EnergyFormula, input);
              return (
                <tr key={k}><td className="py-1">{energyFormulas[k as EnergyFormula].label}</td>
                  <td className="text-right tabular-nums">{Number.isFinite(geb) ? geb : "—"}</td>
                  <td className="text-right tabular-nums text-muted">{Number.isFinite(geb) ? `GET ${totalEnergy({ geb, activity: n(fa) })}` : ""}</td></tr>
              );
            })}
          </tbody></table>
          <p className="mt-2 text-xs text-muted">GET = GEB × factor de actividad + ETA 10 %.</p>
        </Card>
        <Card title="Porcentaje de grasa (pliegues en mm)">
          <p className="mb-2 text-xs text-muted">Durnin-Womersley: bíceps, tríceps, subescapular, suprailíaco</p>
          <div className="grid grid-cols-4 gap-2">
            {(["b", "t", "sub", "sup"] as const).map((k) => <Input key={k} placeholder={{ b: "Bíceps", t: "Tríceps", sub: "Subesc.", sup: "Suprail." }[k]} value={folds[k]} onChange={(e) => setFolds({ ...folds, [k]: e.target.value })} />)}
          </div>
          {dw > 0 && <p className="mt-2 text-sm">Densidad {dw.toFixed(4)} · Siri <strong>{siri(dw)} %</strong> · Brozek {brozek(dw)} %</p>}
          <p className="mb-2 mt-4 text-xs text-muted">Jackson-Pollock 3: {sex === "M" ? "pecho, abdominal, muslo" : "tríceps, suprailíaco, muslo"}</p>
          <div className="grid grid-cols-3 gap-2">
            {(["x1", "x2", "x3"] as const).map((k) => <Input key={k} value={folds[k]} onChange={(e) => setFolds({ ...folds, [k]: e.target.value })} />)}
          </div>
          {jp > 0 && <p className="mt-2 text-sm">Densidad {jp.toFixed(4)} · Siri <strong>{siri(jp)} %</strong></p>}
        </Card>
        <Card title="Distribución de macronutrientes">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Energía (kcal)"><Input value={kcal} onChange={(e) => setKcal(e.target.value)} /></Field>
            <Field label="Distribución"><Select value={preset} onChange={(e) => setPreset(e.target.value)}>{macroPresets.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</Select></Field>
          </div>
          <p className="mt-3 text-sm">P {p.pct.protein_pct}% = <strong>{m.protein_g} g</strong> · L {p.pct.fat_pct}% = <strong>{m.fat_g} g</strong> · HC {p.pct.carbs_pct}% = <strong>{m.carbs_g} g</strong></p>
          {p.note && <p className="mt-1 text-xs text-muted">{p.note}</p>}
        </Card>
        <Card title="Frecuencia cardiaca (Karvonen)">
          <div className="grid grid-cols-2 gap-2"><Field label="FC reposo"><Input value={rest} onChange={(e) => setRest(e.target.value)} /></Field>
            <div className="text-sm"><p className="text-muted">FCmáx Tanaka</p><p className="font-semibold">{fcmax} lpm</p><p className="text-xs text-muted">Fox (220−edad): {maxHeartRate.fox(n(age))}</p></div></div>
          <ul className="mt-2 text-sm">{heartRateZones(fcmax, n(rest)).map((z) => <li key={z.zone} className="flex justify-between py-0.5"><span>Z{z.zone} {z.label} ({z.from}-{z.to} %)</span><span className="tabular-nums">{z.minHr}–{z.maxHr}</span></li>)}</ul>
        </Card>
        <Card title="Gasto por actividad y fuerza">
          <div className="grid grid-cols-2 gap-2">
            <Field label="MET"><Input value={met} onChange={(e) => setMet(e.target.value)} /></Field>
            <Field label="Minutos"><Input value={min} onChange={(e) => setMin(e.target.value)} /></Field>
          </div>
          <p className="mt-2 text-sm">Gasto: <strong>{metKcal(n(met), n(w), n(min))} kcal</strong> (MET × 3.5 × peso / 200 × min)</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Field label="Carga (kg)"><Input value={rmW} onChange={(e) => setRmW(e.target.value)} /></Field>
            <Field label="Repeticiones"><Input value={rmR} onChange={(e) => setRmR(e.target.value)} /></Field>
          </div>
          <p className="mt-2 text-sm">1RM estimada: Epley <strong>{oneRepMaxEpley(n(rmW), n(rmR))} kg</strong> · Brzycki {oneRepMaxBrzycki(n(rmW), n(rmR))} kg</p>
        </Card>
      </div>
    </div>
  );
}
