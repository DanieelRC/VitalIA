import { CLINIC_OFFSET } from "./time";

export type Availability = { weekday: number; start_time: string; end_time: string; slot_minutes: number };

/** Genera horarios libres de los próximos `days` días según disponibilidad, excluyendo los ocupados. */
export function freeSlots(avail: Availability[], busy: { starts_at: string; ends_at: string }[], days = 21, from = new Date()) {
  const out: { start: string; end: string }[] = [];
  const minLead = from.getTime() + 2 * 3600e3; // mínimo 2 h de anticipación
  for (let d = 0; d < days; d++) {
    // Fecha local del consultorio
    const local = new Date(from.getTime() + d * 864e5 - 6 * 3600e3);
    const ymd = local.toISOString().slice(0, 10);
    const weekday = new Date(`${ymd}T12:00:00${CLINIC_OFFSET}`).getUTCDay();
    for (const a of avail.filter((x) => x.weekday === weekday)) {
      let t = new Date(`${ymd}T${a.start_time.slice(0, 5)}:00${CLINIC_OFFSET}`).getTime();
      const end = new Date(`${ymd}T${a.end_time.slice(0, 5)}:00${CLINIC_OFFSET}`).getTime();
      const step = a.slot_minutes * 60e3;
      for (; t + step <= end; t += step) {
        if (t < minLead) continue;
        const overlap = busy.some((b) => new Date(b.starts_at).getTime() < t + step && new Date(b.ends_at).getTime() > t);
        if (!overlap) out.push({ start: new Date(t).toISOString(), end: new Date(t + step).toISOString() });
      }
    }
  }
  return out;
}
