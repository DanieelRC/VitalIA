import Link from "next/link";
import {
  ArrowRight, Bot, Calculator, CalendarDays, ClipboardList, FileText, LockKeyhole, MessageCircle, Ruler, ShieldCheck, Smartphone, Sparkles, Utensils,
} from "lucide-react";
import { MacroBar, Plate, PlateMark, Wordmark } from "@/components/plate";
import { cn } from "@/components/ui";
import { LegalLinks } from "@/components/legal-doc";

export type LandingPlan = { code: string; name: string; max_patients: number | null; price_mxn: number | null; ai_budget_usd: number };

const PLATE = [
  { family: "verduras" as const, value: 4 }, { family: "frutas" as const, value: 2 }, { family: "cereales" as const, value: 5 },
  { family: "leguminosas" as const, value: 1 }, { family: "aoa" as const, value: 4 }, { family: "leche" as const, value: 1 }, { family: "grasas" as const, value: 3 },
];

const cta = "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-[background-color,box-shadow,transform,filter] duration-200 ease-out-expo active:scale-[0.97]";

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-field/85 text-field-fg backdrop-blur-md supports-[backdrop-filter]:bg-field/70">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6" aria-label="Principal">
        <Link href="/" className="flex items-center gap-2.5"><PlateMark size={30} /><Wordmark className="text-xl" /></Link>
        <div className="hidden items-center gap-7 text-sm text-field-muted md:flex">
          <a href="#copiloto" className="transition-colors hover:text-field-fg">Copiloto</a>
          <a href="#funciones" className="transition-colors hover:text-field-fg">Funciones</a>
          <a href="#pacientes" className="transition-colors hover:text-field-fg">Pacientes</a>
          <a href="#planes" className="transition-colors hover:text-field-fg">Planes</a>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden h-9 items-center rounded-full px-4 text-sm font-semibold text-field-fg transition-colors hover:bg-white/10 sm:inline-flex">Iniciar sesión</Link>
          <Link href="/registro" className="inline-flex h-9 items-center rounded-full bg-[var(--g-cereales)] px-4 text-sm font-semibold text-[#1c1500] transition-[filter,transform] duration-200 hover:brightness-105 active:scale-[0.97]">Prueba gratis</Link>
        </div>
      </nav>
    </header>
  );
}

/** Demostración del copiloto, dibujada con la misma interfaz de la app (datos ficticios). */
function CopilotDemo() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-label="Ejemplo del copiloto de consulta con una paciente ficticia" role="img">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--g-cereales)_28%,transparent),transparent)] blur-2xl" />
      <div className="landing-float rounded-3xl border border-white/10 bg-surface p-4 text-text shadow-[0_30px_80px_-30px_rgb(0_0_0/0.6)] sm:p-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-primary"><Sparkles className="size-4" /></span>
            <div>
              <p className="text-sm font-semibold leading-tight">Copiloto de consulta</p>
              <p className="text-xs text-muted">Mariana R. · 34 años · 72 kg</p>
            </div>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary">En consulta</span>
        </div>

        <div className="mt-4 flex flex-col gap-3 text-sm">
          <p className="demo-step ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-primary-fg" style={{ animationDelay: "0.5s" }}>
            Propón un plan para bajar de peso con lo de hoy.
          </p>

          <div className="demo-step rounded-2xl border border-border bg-surface-2/60 p-3" style={{ animationDelay: "1.3s" }}>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted"><Calculator className="size-3.5" /> Gasto energético · Mifflin-St Jeor</p>
            <dl className="tabular mt-2 grid grid-cols-3 gap-2">
              {[["GEB", "1,402"], ["GET ×1.375", "1,927"], ["Objetivo", "1,527"]].map(([k, v], i) => (
                <div key={k} className={cn("rounded-xl px-2 py-1.5", i === 2 ? "bg-primary-soft text-primary" : "bg-surface")}>
                  <dt className="text-[11px] opacity-75">{k}</dt>
                  <dd className="font-display text-base font-bold">{v}<span className="text-[11px] font-normal"> kcal</span></dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="demo-step rounded-2xl border border-[color-mix(in_oklab,var(--g-cereales)_55%,var(--border))] p-3" style={{ animationDelay: "2.1s" }}>
            <div className="flex items-start gap-3">
              <Plate segments={PLATE} size={64} label="Distribución del plan por grupos de alimentos" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-xs font-semibold"><span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10px] uppercase tracking-wide text-warn">Borrador</span> Plan hipocalórico · 5 tiempos</p>
                <MacroBar protein={96} fat={51} carbs={172} className="mt-2 text-xs [&_dd]:text-xs" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <span className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-fg">Aplicar al plan</span>
              <span className="inline-flex h-8 items-center rounded-full border border-border px-3.5 text-xs font-semibold">Ajustar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-field text-field-fg">
      <Plate segments={PLATE} size={760} animate={false} className="pointer-events-none absolute -left-72 -bottom-96 opacity-[0.07]" label="" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-28">
        <div className="stagger">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-field-muted">
            <span className="size-1.5 rounded-full bg-[var(--g-frutas)]" /> Para nutriólogos en México · tablas SMAE
          </p>
          <h1 className="mt-5 font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Tu consulta, con un copiloto que <span className="text-[var(--g-cereales)]">sí sabe nutrición</span>.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-field-muted">
            Expediente, fórmulas, plan por equivalentes y portal del paciente en un solo lugar. El copiloto lee el expediente, calcula con tus fórmulas y te deja borradores listos para revisar.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/registro" className={cn(cta, "bg-[var(--g-cereales)] text-[#1c1500] shadow-[0_10px_30px_-10px_var(--g-cereales)] hover:brightness-105")}>
              Empieza tu prueba de 14 días <ArrowRight className="size-4" />
            </Link>
            <a href="#copiloto" className={cn(cta, "border border-white/20 text-field-fg hover:bg-white/10")}>Ver cómo funciona</a>
          </div>
          <p className="mt-4 text-sm text-field-muted">Sin tarjeta. Hasta 5 pacientes durante la prueba.</p>
        </div>
        <CopilotDemo />
      </div>
    </section>
  );
}

function Audience() {
  const items = [
    { t: "Si vas empezando", d: "Las fórmulas, los factores y la distribución de macros te guían paso a paso, con rangos de referencia y avisos cuando algo no cuadra. Consultas con más seguridad desde el primer paciente." },
    { t: "Si ya tienes cartera", d: "Recupera tus tardes: el copiloto prepara el plan, la nota SOAP y el mensaje de seguimiento mientras tú decides. Tus plantillas, fórmulas y catálogos propios, siempre a la mano." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((it) => (
          <article key={it.t} className="reveal rounded-3xl border border-border bg-surface p-6 shadow-soft sm:p-8">
            <h2 className="font-display text-2xl font-bold tracking-tight">{it.t}</h2>
            <p className="mt-3 text-muted">{it.d}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Copilot() {
  const steps = [
    { icon: ClipboardList, t: "Lee el expediente", d: "Antropometría, laboratorios, apego y lo que el paciente registró entre citas. Te dice qué revisar hoy." },
    { icon: Calculator, t: "Calcula con tus fórmulas", d: "Harris-Benedict, Mifflin, FAO/OMS, Katch-McArdle y las tuyas. Cada número sale de una fórmula, no de la imaginación." },
    { icon: FileText, t: "Redacta borradores", d: "Plan por equivalentes, nota SOAP con diagnóstico PES y mensaje al paciente. Nada se guarda hasta que tú lo apruebas." },
  ];
  return (
    <section id="copiloto" className="scroll-mt-20 bg-surface py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="reveal max-w-2xl">
          <p className="text-sm font-semibold text-primary">Copiloto de consulta</p>
          <h2 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Piensa contigo, no por ti.</h2>
          <p className="mt-4 text-lg text-muted">Un asistente dentro del expediente de cada paciente. Tú sigues firmando; él hace las cuentas y el papeleo.</p>
        </div>
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.t} className="reveal group relative rounded-3xl border border-border bg-bg p-6 transition-[transform,box-shadow] duration-300 ease-out-expo hover:-translate-y-1 hover:shadow-lift">
              <span className="font-display text-sm font-bold text-muted">0{i + 1}</span>
              <s.icon className="mt-4 size-7 text-primary transition-transform duration-300 ease-out-expo group-hover:scale-110" />
              <h3 className="mt-4 font-display text-xl font-bold tracking-tight">{s.t}</h3>
              <p className="mt-2 text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
        <div className="reveal mt-6 flex items-start gap-3 rounded-2xl bg-primary-soft p-4 text-sm text-primary sm:items-center">
          <ShieldCheck className="size-5 shrink-0" />
          <p><strong>No inventa cifras.</strong> Si un número no viene del expediente, de la conversación o de un cálculo, el copiloto lo marca para que lo revises.</p>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { icon: ClipboardList, color: "var(--g-verduras)", t: "Expediente clínico", d: "Notas SOAP con diagnóstico PES, notas firmadas que no se modifican y bitácora de accesos." },
    { icon: Ruler, color: "var(--g-leche)", t: "Antropometría", d: "Pliegues, circunferencias y bioimpedancia con % de grasa, masa muscular y gráficas de evolución." },
    { icon: Calculator, color: "var(--g-cereales)", t: "Fórmulas y macros", d: "Gasto energético, composición corporal y distribución por porcentaje o g/kg, con tus propias fórmulas." },
    { icon: Utensils, color: "var(--g-aoa)", t: "Plan por equivalentes", d: "Equivalentes SMAE por tiempo de comida, menú con recetas por patología y lista del súper." },
    { icon: CalendarDays, color: "var(--g-leguminosas)", t: "Agenda y recordatorios", d: "Tus horarios, citas que el paciente solicita y recordatorios automáticos por correo." },
    { icon: FileText, color: "var(--g-grasas)", t: "PDF con tu marca", d: "Plan, expediente y rutinas con tu logo, tus colores y tus datos de contacto." },
  ];
  return (
    <section id="funciones" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="reveal max-w-2xl">
        <p className="text-sm font-semibold text-primary">Todo el consultorio</p>
        <h2 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">De la primera consulta al seguimiento.</h2>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f) => (
          <article key={f.t} className="reveal rounded-3xl border border-border bg-surface p-6 shadow-soft transition-[transform,box-shadow] duration-300 ease-out-expo hover:-translate-y-1 hover:shadow-lift">
            <span className="grid size-11 place-items-center rounded-2xl" style={{ background: `color-mix(in oklab, ${f.color} 16%, transparent)`, color: f.color }}>
              <f.icon className="size-5" />
            </span>
            <h3 className="mt-4 font-display text-lg font-bold tracking-tight">{f.t}</h3>
            <p className="mt-1.5 text-sm text-muted">{f.d}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Patients() {
  const meals = [["Desayuno", true], ["Colación", true], ["Comida", false], ["Cena", false]] as const;
  return (
    <section id="pacientes" className="scroll-mt-20 overflow-hidden bg-field py-20 text-field-fg">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div className="reveal">
          <p className="text-sm font-semibold text-[var(--g-frutas)]">Portal del paciente</p>
          <h2 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Acompañamiento entre citas.</h2>
          <p className="mt-4 text-lg text-field-muted">Tus pacientes ven su plan, sus recetas y su progreso desde el celular, sin instalar nada. Registran lo que comen y te escriben; tú llegas a la consulta sabiendo cómo les fue.</p>
          <ul className="mt-6 grid gap-3 text-field-fg sm:grid-cols-2">
            {[[Smartphone, "Se instala como app"], [MessageCircle, "Mensajes contigo"], [Bot, "Asistente con su propio plan"], [LockKeyhole, "Tus notas clínicas nunca las ve"]].map(([Icon, t]) => {
              const I = Icon as typeof Bot;
              return <li key={t as string} className="flex items-center gap-2.5 text-sm"><I className="size-4 text-[var(--g-frutas)]" />{t as string}</li>;
            })}
          </ul>
        </div>
        <div className="reveal mx-auto w-full max-w-xs">
          <div className="landing-float rounded-[2.2rem] border border-white/15 bg-field-2 p-2.5 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.7)]" style={{ animationDelay: "-3s" }}>
            <div className="rounded-[1.7rem] bg-bg p-4 text-text">
              <p className="text-xs text-muted">Martes</p>
              <p className="font-display text-xl font-bold tracking-tight">Hoy te toca</p>
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-soft">
                <Plate segments={PLATE} size={56} label="Tu plato de hoy" />
                <div className="text-xs"><p className="font-semibold">1,527 kcal</p><p className="text-muted">5 tiempos de comida</p></div>
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {meals.map(([m, done]) => (
                  <li key={m} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm shadow-soft">
                    {m}
                    <span className={cn("grid size-5 place-items-center rounded-full border text-[10px]", done ? "border-primary bg-primary text-primary-fg" : "border-border")}>{done ? "✓" : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Plans({ plans }: { plans: LandingPlan[] }) {
  return (
    <section id="planes" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="reveal mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold text-primary">Planes</p>
        <h2 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Pagas por los pacientes que atiendes.</h2>
        <p className="mt-4 text-lg text-muted">Todas las funciones en todos los planes. Solo cuentan los pacientes activos: los que dejan de venir conservan su expediente y no ocupan lugar.</p>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p, i) => {
          const featured = i === 1;
          return (
            <article key={p.code} className={cn("reveal relative flex flex-col rounded-3xl border p-6 transition-[transform,box-shadow] duration-300 ease-out-expo hover:-translate-y-1 hover:shadow-lift",
              featured ? "border-primary bg-surface shadow-lift ring-4 ring-primary/10" : "border-border bg-surface shadow-soft")}>
              {featured && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-fg">Recomendado</span>}
              <h3 className="font-display text-xl font-bold tracking-tight">{p.name}</h3>
              <p className="mt-4 font-display text-5xl font-extrabold tracking-tight tabular-nums">{p.max_patients ?? "∞"}</p>
              <p className="text-sm text-muted">{p.max_patients ? "pacientes activos" : "pacientes activos, sin límite"}</p>
              <p className="mt-4 text-sm font-semibold">{p.price_mxn != null ? `$${p.price_mxn.toLocaleString("es-MX")} MXN al mes, IVA incluido` : "Precio próximamente"}</p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm text-muted">
                <li>Copiloto y asistente con IA</li>
                <li>Portal del paciente</li>
                <li>Hasta ${p.ai_budget_usd} USD de IA al mes</li>
              </ul>
              <Link href="/registro" className={cn(cta, "mt-6 h-10 text-sm", featured ? "bg-primary text-primary-fg hover:brightness-110" : "border border-border hover:border-primary/50 hover:bg-primary-soft/50")}>
                Probar 14 días
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Trust() {
  const items = [
    { t: "Notas clínicas privadas", d: "El paciente nunca ve tus notas SOAP, diagnósticos ni notas rápidas. Lo bloquea la base de datos, no solo la pantalla." },
    { t: "Cada consultorio aislado", d: "Tus pacientes, archivos y configuración solo los ves tú. Ningún otro consultorio puede leerlos." },
    { t: "Pensado para la norma", d: "Consentimiento de datos sensibles (LFPDPPP) y notas fechadas y firmadas que se corrigen con adenda, como pide la NOM-004." },
  ];
  return (
    <section className="bg-surface py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="reveal max-w-xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Datos de salud, tratados como tales.</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {items.map((it) => (
            <div key={it.t} className="reveal border-t-2 border-primary pt-5">
              <h3 className="font-display text-lg font-bold tracking-tight">{it.t}</h3>
              <p className="mt-2 text-sm text-muted">{it.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const qs = [
    ["¿Necesito tarjeta para la prueba?", "No. Creas tu consultorio con tu correo y tienes 14 días con hasta 5 pacientes activos."],
    ["¿La IA puede cambiar el plan de un paciente sola?", "No. El copiloto solo propone borradores. Tú decides qué se aplica, y todo queda como borrador hasta que lo revisas."],
    ["¿Mis pacientes pagan algo?", "No. El plan lo paga el consultorio. Tus pacientes entran gratis al portal con la invitación que les envías."],
    ["¿Qué pasa si llego al límite de pacientes?", "Puedes marcar como inactivos a quienes ya no vienen (su expediente se conserva) o cambiar a un plan mayor."],
    ["¿Funciona en el celular?", "Sí. Tanto el consultorio como el portal del paciente funcionan en el navegador del celular y se pueden instalar como app."],
  ];
  return (
    <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <h2 className="reveal font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Preguntas frecuentes</h2>
      <div className="mt-8 divide-y divide-border border-y border-border">
        {qs.map(([q, a]) => (
          <details key={q} className="reveal group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
              {q}
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-lg leading-none transition-transform duration-300 ease-out-expo group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 pr-10 text-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-4 pb-20 sm:px-6">
      <div className="reveal relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-field px-6 py-14 text-center text-field-fg sm:px-12">
        <Plate segments={PLATE} size={420} animate={false} className="pointer-events-none absolute -right-32 -top-40 opacity-15" label="" />
        <h2 className="relative font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Tu próxima consulta, más ligera.</h2>
        <p className="relative mx-auto mt-4 max-w-lg text-field-muted">Crea tu consultorio en un minuto y prueba el copiloto con tus propios pacientes.</p>
        <Link href="/registro" className={cn(cta, "relative mt-8 bg-[var(--g-cereales)] text-[#1c1500] hover:brightness-105")}>
          Empieza gratis <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:px-6">
        <span className="flex items-center gap-2 text-text"><PlateMark size={24} /><Wordmark /></span>
        <p>Herramienta de apoyo para profesionales de la nutrición. No sustituye el juicio clínico.</p>
        <Link href="/login" className="font-semibold text-text hover:text-primary">Iniciar sesión</Link>
      </div>
      <LegalLinks className="mx-auto max-w-6xl px-4 pb-8 text-sm text-muted sm:px-6" />
    </footer>
  );
}

export function Landing({ plans }: { plans: LandingPlan[] }) {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Audience />
        <Copilot />
        <Features />
        <Patients />
        <Plans plans={plans} />
        <Trust />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
