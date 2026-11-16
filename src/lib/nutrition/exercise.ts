// Fórmulas de prescripción de ejercicio.
export const maxHeartRate = {
  fox: (age: number) => 220 - age,
  tanaka: (age: number) => Math.round(208 - 0.7 * age),
};

/** Karvonen: FC objetivo = (FCmáx − FCreposo) × intensidad + FCreposo */
export function karvonen(maxHr: number, restHr: number, intensityPct: number) {
  return Math.round((maxHr - restHr) * (intensityPct / 100) + restHr);
}

export function heartRateZones(maxHr: number, restHr: number) {
  return [
    { zone: 1, label: "Recuperación", from: 50, to: 60 },
    { zone: 2, label: "Aeróbica ligera (quema de grasa)", from: 60, to: 70 },
    { zone: 3, label: "Aeróbica", from: 70, to: 80 },
    { zone: 4, label: "Umbral anaeróbico", from: 80, to: 90 },
    { zone: 5, label: "Máxima", from: 90, to: 100 },
  ].map((z) => ({ ...z, minHr: karvonen(maxHr, restHr, z.from), maxHr: karvonen(maxHr, restHr, z.to) }));
}

/** kcal = MET × 3.5 × peso(kg) / 200 × minutos */
export const metKcal = (met: number, weightKg: number, minutes: number) => Math.round(((met * 3.5 * weightKg) / 200) * minutes);

/** Repetición máxima estimada (Epley) */
export const oneRepMaxEpley = (weight: number, reps: number) => Math.round(weight * (1 + reps / 30) * 10) / 10;
/** Repetición máxima estimada (Brzycki) */
export const oneRepMaxBrzycki = (weight: number, reps: number) => Math.round((weight * 36) / (37 - reps) * 10) / 10;
