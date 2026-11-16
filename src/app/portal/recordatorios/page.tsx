import { ActionForm, SubmitButton } from "@/components/form";
import { PushToggle } from "@/components/push-toggle";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { saveReminderPrefs } from "@/lib/actions/push";
import type { MealPlan } from "@/lib/data";
import type { ReminderPrefs } from "@/lib/reminders";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Recordatorios" };

const DEFAULT_TIMES: Record<string, string> = { desayuno: "08:00", "colación matutina": "11:00", comida: "14:30", "colación vespertina": "17:30", cena: "20:30", colación: "11:00" };
const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default async function RemindersPage() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const [{ data: prefs }, { data: plan }] = await Promise.all([
    supabase.from("reminder_prefs").select("meals, water, weigh_day").eq("patient_id", s.patientId!).maybeSingle(),
    supabase.from("meal_plans").select("meals").eq("patient_id", s.patientId!).eq("status", "activo").maybeSingle(),
  ]);
  const saved = (prefs ?? { meals: [], water: false, weigh_day: null }) as ReminderPrefs;
  const names = ((plan?.meals ?? []) as MealPlan["meals"]).map((m) => m.name);
  const rows = (names.length ? names : ["Desayuno", "Comida", "Cena"]).map((label) => ({
    label, time: saved.meals.find((m) => m.label === label)?.time ?? "", suggestion: DEFAULT_TIMES[label.toLowerCase()] ?? "",
  }));

  return (
    <>
      <PageHeader title="Recordatorios" subtitle="Avisos suaves en tu teléfono para tus comidas, tu agua y tu registro de peso. Tú decides cuáles y a qué hora." />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card title="Notificaciones">
          <p className="mb-3 text-sm text-muted">Se activan por dispositivo. Puedes apagarlas cuando quieras.</p>
          <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
        </Card>
        <Card title="Qué quieres que te recuerde">
          <ActionForm action={saveReminderPrefs} className="grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Comidas <span className="font-normal text-muted">(deja vacía la hora para no recibir aviso)</span></legend>
              {rows.map((r) => (
                <label key={r.label} className="grid grid-cols-[1fr_8rem] items-center gap-3 text-sm">
                  <span>{r.label}</span>
                  <input type="hidden" name="meal_label" value={r.label} />
                  <Input type="time" name="meal_time" defaultValue={r.time} aria-label={`Hora de ${r.label}`} title={r.suggestion ? `Sugerencia: ${r.suggestion}` : undefined} />
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="water" defaultChecked={saved.water} className="size-4.5" />
              <span>Recordarme tomar agua <span className="text-muted">(cada 2 horas, de 10:00 a 20:00)</span></span>
            </label>
            <Field label="Recordarme pesarme" hint="A las 8:00 del día que elijas">
              <Select name="weigh_day" defaultValue={saved.weigh_day ?? ""}>
                <option value="">No recordarme</option>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </Select>
            </Field>
            <div><SubmitButton>Guardar</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
