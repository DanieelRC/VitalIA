// Zona horaria del consultorio. México centro no usa horario de verano desde 2022 (UTC−6).
export const CLINIC_TZ = "America/Mexico_City";
export const CLINIC_OFFSET = "-06:00";

/** "2026-11-15T10:30" (hora local del consultorio) → ISO UTC */
export const localToISO = (s: string) => new Date(`${s.length === 16 ? s + ":00" : s}${CLINIC_OFFSET}`).toISOString();

/** ISO → "YYYY-MM-DDTHH:mm" en hora del consultorio (para <input type="datetime-local">) */
export function isoToLocal(iso: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export const todayLocal = () => isoToLocal(new Date()).slice(0, 10);
