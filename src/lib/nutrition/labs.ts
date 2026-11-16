// Analitos de laboratorio con rangos de referencia para adultos. Son orientativos: los intervalos de cada
// laboratorio y el criterio clínico prevalecen. Fuentes: ADA Standards of Care, ATP III / AHA, KDIGO.
export type LabDef = { key: string; label: string; unit: string; low?: number; high?: number; note?: string };

export const LABS: LabDef[] = [
  { key: "glucosa", label: "Glucosa en ayuno", unit: "mg/dL", low: 70, high: 99, note: "100–125 prediabetes · ≥126 diabetes (ADA)" },
  { key: "hba1c", label: "HbA1c", unit: "%", high: 5.6, note: "5.7–6.4 prediabetes · ≥6.5 diabetes (ADA)" },
  { key: "colesterol", label: "Colesterol total", unit: "mg/dL", high: 199, note: "Deseable <200" },
  { key: "ldl", label: "LDL", unit: "mg/dL", high: 99, note: "Óptimo <100" },
  { key: "hdl", label: "HDL", unit: "mg/dL", low: 40, note: "Bajo <40 (H) / <50 (M)" },
  { key: "trigliceridos", label: "Triglicéridos", unit: "mg/dL", high: 149, note: "Normal <150" },
  { key: "creatinina", label: "Creatinina", unit: "mg/dL", low: 0.6, high: 1.3 },
  { key: "urea", label: "Urea", unit: "mg/dL", low: 15, high: 45 },
  { key: "acido_urico", label: "Ácido úrico", unit: "mg/dL", low: 2.4, high: 7 },
  { key: "hemoglobina", label: "Hemoglobina", unit: "g/dL", low: 12, high: 17.5 },
  { key: "albumina", label: "Albúmina", unit: "g/dL", low: 3.5, high: 5 },
  { key: "tsh", label: "TSH", unit: "mUI/L", low: 0.4, high: 4 },
  { key: "vitamina_d", label: "Vitamina D (25-OH)", unit: "ng/mL", low: 30, high: 100 },
  { key: "ferritina", label: "Ferritina", unit: "ng/mL", low: 15, high: 300 },
];

export const LAB_BY_KEY = Object.fromEntries(LABS.map((l) => [l.key, l]));

export type LabFlag = "bajo" | "normal" | "alto";

export function labFlag(key: string, value: number): LabFlag | null {
  const d = LAB_BY_KEY[key];
  if (!d || !Number.isFinite(value)) return null;
  if (d.low != null && value < d.low) return "bajo";
  if (d.high != null && value > d.high) return "alto";
  return "normal";
}
