import Link from "next/link";
import { ArrowRight, CalendarDays, Camera, ClipboardList, MessageCircle, Repeat, Scale, ShoppingBasket, Sparkles } from "lucide-react";
import { DayLog } from "@/components/day-log";
import { Plate } from "@/components/plate";
import { fmtDateTime, LinkButton } from "@/components/ui";
import type { MealPlan } from "@/lib/data";
import { FAMILY_LABEL, familyColor, plateSegments } from "@/lib/groups";
import { createClient, requireRole } from "@/lib/supabase/server";
import { CLINIC_TZ, todayLocal } from "@/lib/time";

export const metadata = { title: "Inicio" };

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export default async function PortalHome() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const pid = s.patientId!;
  const [plan, appt, last, unread, dayLog] = await Promise.all([
    supabase.from("meal_plans").select("name, kcal_target, meals, menu").eq("patient_id", pid).eq("status", "activo").maybeSingle(),
    supabase.from("appointments").select("starts_at, status").eq("patient_id", pid).gte("starts_at", new Date().toISOString()).neq("status", "cancelada").order("starts_at").limit(1).maybeSingle(),
    supabase.from("progress_logs").select("weight_kg, logged_at").eq("patient_id", pid).not("weight_kg", "is", null).order("logged_at", { ascending: false }).order("created_at", { ascending: false }).limit(2),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("patient_id", pid).is("read_at", null).neq("sender_id", s.userId),
    supabase.from("daily_logs").select("water_glasses, satiety, digestion, energy").eq("patient_id", pid).eq("day", todayLocal()).maybeSingle(),
  ]);

  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: CLINIC_TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const today = new Intl.DateTimeFormat("es-MX", { timeZone: CLINIC_TZ, weekday: "long", day: "numeric", month: "long" }).format(now);
  const dow = WEEKDAY[new Intl.DateTimeFormat("en-US", { timeZone: CLINIC_TZ, weekday: "short" }).format(now)];

  const p = plan.data as Pick<MealPlan, "name" | "kcal_target" | "meals" | "menu"> | null;
  const todayMenu = (p?.menu ?? []).filter((m) => m.day === dow);
  const recipeIds = [...new Set(todayMenu.map((m) => m.recipe_id).filter(Boolean))] as string[];
  const { data: recs } = recipeIds.length ? await supabase.from("recipes").select("id, name").in("id", recipeIds) : { data: [] };
  const rname = Object.fromEntries((recs ?? []).map((r) => [r.id, r.name]));

  const w = last.data ?? [];
  const diff = w.length === 2 ? Math.round((Number(w[0].weight_kg) - Number(w[1].weight_kg)) * 10) / 10 : null;

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{greeting}{s.fullName ? `, ${s.fullName.split(" ")[0]}` : ""}</h1>
        <p className="mt-2 text-muted first-letter:uppercase">{today}</p>
      </header>

      {p ? (
        <section className="overflow-hidden rounded-3xl bg-field text-field-fg shadow-lift">
          <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 sm:px-7 sm:pt-7">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">Hoy te toca</h2>
              <p className="mt-1 text-sm text-field-muted">{p.name} · {Math.round(p.kcal_target)} kcal al día</p>
            </div>
            <Link href="/portal/mi-plan" className="group inline-flex items-center gap-1.5 rounded-full bg-field-2 px-4 py-2 text-sm font-semibold transition-colors hover:bg-field-fg hover:text-field">
              Ver mi plan <ArrowRight className="size-4 transition-transform duration-300 ease-out-expo group-hover:translate-x-0.5" />
            </Link>
          </div>
          <ol className="stagger mt-5 grid gap-px bg-field-2 sm:grid-cols-2 lg:grid-cols-3">
            {p.meals.map((m, i) => {
              const dish = todayMenu.find((x) => x.meal === i);
              return (
                <li key={i} className="flex gap-4 bg-field p-5 sm:px-7">
                  <Plate segments={plateSegments(m.equivalents)} size={64} />
                  <div className="min-w-0">
                    <p className="font-display text-lg font-bold leading-tight">{m.name}</p>
                    {dish && (
                      <p className="mt-0.5 text-sm">
                        {dish.recipe_id && rname[dish.recipe_id]
                          ? <Link className="underline decoration-field-muted/60 hover:decoration-field-fg" href={`/portal/recetas/${dish.recipe_id}`}>{rname[dish.recipe_id]}</Link>
                          : dish.text}
                      </p>
                    )}
                    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-field-muted">
                      {plateSegments(m.equivalents).map((seg) => (
                        <li key={seg.family} className="flex items-center gap-1.5">
                          <span aria-hidden className="size-2 rounded-full" style={{ background: familyColor(seg.family) }} />
                          <span className="tabular font-semibold text-field-fg">{seg.value}</span> {FAMILY_LABEL[seg.family]}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <section className="rounded-3xl bg-field p-7 text-field-fg shadow-lift">
          <h2 className="font-display text-2xl font-bold tracking-tight">Tu plan está en camino</h2>
          <p className="mt-2 max-w-prose text-sm text-field-muted">Tu nutriólogo todavía no publica tu plan de alimentación. Mientras tanto puedes agendar tu cita y contarle qué comiste ayer; eso le ayuda a prepararlo.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <LinkButton href="/portal/citas" variant="primary">Agendar cita</LinkButton>
            <LinkButton href="/portal/r24h" variant="ghost" className="text-field-fg hover:bg-field-2">Llenar recordatorio</LinkButton>
          </div>
        </section>
      )}

      <DayLog initial={dayLog.data ?? { water_glasses: 0, satiety: null, digestion: null, energy: null }} />

      <section aria-label="Seguimiento" className="grid gap-3 sm:grid-cols-3">
        <StatusLink href="/portal/citas" icon={<CalendarDays className="size-5" />} label="Próxima cita"
          value={appt.data ? fmtDateTime(appt.data.starts_at) : "Sin cita agendada"} hint={appt.data ? appt.data.status : "Agenda cuando quieras"} />
        <StatusLink href="/portal/progreso" icon={<Scale className="size-5" />} label="Último peso"
          value={w[0]?.weight_kg ? `${w[0].weight_kg} kg` : "Aún sin registros"}
          hint={diff === null ? "Registra tu peso cada semana" : diff === 0 ? "Igual que el registro anterior" : `${diff > 0 ? "+" : ""}${diff} kg desde el registro anterior`} />
        <StatusLink href="/portal/mensajes" icon={<MessageCircle className="size-5" />} label="Mensajes"
          value={unread.count ? `${unread.count} sin leer` : "Al día"} hint="Escríbele a tu nutriólogo" highlight={!!unread.count} />
      </section>

      <section aria-label="Acciones" className="grid gap-3 sm:grid-cols-2">
        <ActionRow href="/portal/comidas" icon={<Camera className="size-5" />} title="Foto de tu comida" text="Súbela y tu nutriólogo te deja comentarios." />
        <ActionRow href="/portal/super" icon={<ShoppingBasket className="size-5" />} title="Lista del súper" text="Los ingredientes de tu menú de la semana, ya sumados." />
        <ActionRow href="/portal/intercambios" icon={<Repeat className="size-5" />} title="Intercambios" text="Cambia un alimento por otro del mismo grupo." />
        <ActionRow href="/portal/r24h" icon={<ClipboardList className="size-5" />} title="¿Qué comiste ayer?" text="Llena tu recordatorio de 24 horas antes de tu cita." />
        <ActionRow href="/portal/asistente" icon={<Sparkles className="size-5" />} title="Pregúntale a Vita" text="Dudas sobre tu plan, intercambios o cómo vas." />
      </section>
    </div>
  );
}

function StatusLink({ href, icon, label, value, hint, highlight }: { href: string; icon: React.ReactNode; label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <Link href={href} className="group rounded-2xl border border-border bg-surface p-4 shadow-soft transition-[box-shadow,transform,border-color] duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift">
      <p className="flex items-center gap-2 text-sm text-muted"><span className={highlight ? "text-primary" : ""}>{icon}</span>{label}</p>
      <p className="mt-2 font-display text-xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted first-letter:uppercase">{hint}</p>}
    </Link>
  );
}

function ActionRow({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link href={href} className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-soft transition-[box-shadow,transform,border-color] duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
      <ArrowRight className="size-4 text-muted transition-transform duration-300 ease-out-expo group-hover:translate-x-1 group-hover:text-primary" />
    </Link>
  );
}
