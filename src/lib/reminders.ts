// Qué recordatorios tocan en una ventana de tiempo. Lógica pura: el cron la llama cada 15 minutos.
export type ReminderPrefs = { meals: { label: string; time: string }[]; water: boolean; weigh_day: number | null };
export type Reminder = { key: string; title: string; body: string; url: string };

const toMin = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const WATER_HOURS = [10, 12, 14, 16, 18, 20];

/**
 * @param date "YYYY-MM-DD" local · @param minutes minutos desde medianoche (hora local) · @param weekday 0 = domingo
 * @param windowMin tamaño de la ventana hacia atrás (el cron corre cada `windowMin` minutos)
 */
export function dueReminders(prefs: ReminderPrefs, now: { date: string; minutes: number; weekday: number }, windowMin = 15): Reminder[] {
  const inWindow = (t: number) => Number.isFinite(t) && t <= now.minutes && t > now.minutes - windowMin;
  const out: Reminder[] = [];
  for (const m of prefs.meals ?? []) {
    if (inWindow(toMin(m.time))) {
      out.push({ key: `${now.date}-comida-${m.time}`, title: `Hora de tu ${m.label.toLowerCase()}`, body: "Revisa qué te toca hoy en tu plan.", url: "/portal" });
    }
  }
  if (prefs.water) {
    for (const h of WATER_HOURS) {
      if (inWindow(h * 60)) out.push({ key: `${now.date}-agua-${h}`, title: "Un vaso de agua", body: "Toma agua y regístralo en Mi día.", url: "/portal" });
    }
  }
  if (prefs.weigh_day === now.weekday && inWindow(8 * 60)) {
    out.push({ key: `${now.date}-peso`, title: "Hoy toca pesarte", body: "Registra tu peso de la semana, en ayunas si puedes.", url: "/portal/progreso" });
  }
  return out;
}

export const isValidTime = (t: string) => Number.isFinite(toMin(t)) && toMin(t) < 24 * 60;
