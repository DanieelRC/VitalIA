import Link from "next/link";
import { AssistantChat } from "@/components/assistant-chat";
import { Alert, cn, fmtDate, fmtDateTime } from "@/components/ui";
import { chatHistory } from "@/lib/ai/history";
import { evolutionCard, patientCard } from "@/lib/ai/patient-cards";
import type { CalcRow } from "@/lib/ai/calc";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Copiloto de consulta" };

const DOT = { normal: "var(--g-verduras)", limite: "var(--g-cereales)", bajo: "var(--g-leche)", alto: "var(--g-aoa)" } as const;

export default async function Copilot({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireRole("nutriologo");
  const supabase = await createClient();
  const [h, pc, ev, lastConsult, nextAppt] = await Promise.all([
    chatHistory(s.userId, 30, id),
    patientCard(supabase, id),
    evolutionCard(supabase, id),
    supabase.from("consultations").select("id, consulted_at, status").eq("patient_id", id).order("consulted_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("appointments").select("starts_at").eq("patient_id", id).gte("starts_at", new Date().toISOString()).neq("status", "cancelada").order("starts_at").limit(1).maybeSingle(),
  ]);
  const P: CalcRow[] = "error" in pc ? [] : pc.resultados;
  const E: CalcRow[] = "error" in ev ? [] : ev.resultados;
  const row = (rows: CalcRow[], label: string) => rows.find((r) => r.etiqueta.startsWith(label));

  // Resumen previo: se arma con reglas, sin llamar al modelo
  const tiles = [
    { label: "Peso más reciente", r: row(E, "Peso más reciente") ?? row(P, "Peso") },
    { label: "Cambio total", r: row(E, "Cambio total") },
    { label: "Ritmo", r: row(E, "Ritmo") },
    { label: "Apego en 14 días", r: row(E, "Apego") },
    { label: "A su meta", r: row(E, "Distancia") },
    { label: "Plan activo", r: row(P, "Plan activo") },
  ].filter((t) => t.r);

  const review: { text: string; href?: string }[] = [];
  const base = `/consultorio/pacientes/${id}`;
  if (!("error" in pc)) for (const a of pc.avisos ?? []) review.push({ text: a.replace(" Pídeselos al nutriólogo antes de calcular.", ""), href: base });
  const measured = row(P, "Peso")?.nota?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (measured) {
    const days = Math.floor((Date.now() - Date.parse(measured)) / 864e5);
    if (days > 30) review.push({ text: `La última antropometría es de hace ${days} días: toca medir.`, href: `${base}/antropometria` });
  }
  const apego = row(E, "Apego");
  if (apego?.estado && apego.estado !== "normal") review.push({ text: `Apego de ${apego.valor} en 14 días: explorar barreras y ajustar el plan.`, href: `${base}/comidas` });
  for (const l of P.filter((r) => r.etiqueta.startsWith("Lab ·") && r.estado && r.estado !== "normal")) review.push({ text: `${l.etiqueta.slice(6)} ${l.estado === "limite" ? "en el límite" : l.estado}: ${l.valor}.`, href: `${base}/laboratorios` });
  if (row(P, "Plan activo")?.valor === "sin plan activo") review.push({ text: "No tiene plan activo: pídele al copiloto que proponga uno.", href: `${base}/plan` });
  const allergies = row(P, "Alergias");
  if (allergies && allergies.valor !== "ninguna registrada") review.push({ text: `Alergias o intolerancias: ${allergies.valor}.` });
  if (lastConsult.data?.status === "borrador") review.push({ text: `Hay una nota del ${fmtDate(lastConsult.data.consulted_at)} sin firmar.`, href: `${base}/expediente/${lastConsult.data.id}` });
  if (!("error" in ev)) for (const a of ev.avisos ?? []) review.push({ text: a });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr] lg:items-start">
      <aside className="animate-enter overflow-hidden rounded-3xl bg-field text-field-fg shadow-lift lg:sticky lg:top-4">
        <div className="px-5 pt-5">
          <p className="text-xs uppercase tracking-wide text-field-muted">Antes de la consulta</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight">Cómo llega hoy</h2>
          <p className="mt-1 text-xs text-field-muted">
            {lastConsult.data ? `Última consulta ${fmtDate(lastConsult.data.consulted_at)}` : "Primera consulta"}
            {nextAppt.data ? ` · próxima cita ${fmtDateTime(nextAppt.data.starts_at)}` : ""}
          </p>
        </div>
        {tiles.length > 0 ? (
          <dl className="mt-4 grid grid-cols-2 gap-px bg-field-2">
            {tiles.map((t, i) => (
              <div key={t.label} className={cn("animate-enter bg-field px-5 py-3", (t.label === "Plan activo" || (i === tiles.length - 1 - (tiles.at(-1)?.label === "Plan activo" ? 1 : 0) && i % 2 === 0)) && "col-span-2")} style={{ animationDelay: `${60 + i * 50}ms` }}>
                <dt className="text-[11px] text-field-muted">{t.label}</dt>
                <dd className={cn("tabular mt-0.5 flex items-center gap-1.5 font-display font-extrabold tracking-tight", t.label === "Plan activo" ? "text-sm" : "text-xl")}>
                  {t.r!.estado && <span className="size-2 shrink-0 rounded-full" style={{ background: DOT[t.r!.estado] }} aria-hidden />}
                  {t.r!.valor}
                </dd>
                {t.r!.nota && <dd className="text-[11px] text-field-muted">{t.r!.nota}</dd>}
              </div>
            ))}
          </dl>
        ) : <p className="px-5 py-4 text-sm text-field-muted">Aún no hay mediciones ni registros para resumir.</p>}
        <div className="px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-field-muted">Qué revisar hoy</h3>
          {review.length ? (
            <ul className="mt-2 grid gap-1.5 text-sm">
              {review.slice(0, 8).map((r, i) => (
                <li key={i} className="animate-enter flex gap-2" style={{ animationDelay: `${200 + i * 50}ms` }}>
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--g-frutas)]" aria-hidden />
                  {r.href ? <Link href={r.href} className="underline decoration-field-muted/50 underline-offset-2 transition-colors hover:decoration-current">{r.text}</Link> : <span>{r.text}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-field-muted">Sin pendientes: expediente completo y sin alertas.</p>}
        </div>
      </aside>

      <div className="min-w-0">
        {!h.enabled && <div className="mb-3"><Alert tone="warn">El asistente está desactivado en Ajustes.</Alert></div>}
        <AssistantChat patientId={id} initial={h.messages} maxChars={h.maxChars} className="h-[calc(100dvh-15rem)] min-h-[28rem] rounded-2xl"
          disclaimer="Copiloto de IA (Grok). Ya conoce el expediente de este paciente; se envía sin nombre ni datos de contacto. Las cifras salen de las fórmulas de la app y todo lo que propone es un borrador que tú aplicas."
          suggestions={[
            "Dame el resumen previo: cómo llega y qué conviene revisar hoy",
            "Calcula su GET con Mifflin y actividad ligera, con déficit de 400 kcal, y propón un plan con 1.6 g/kg de proteína y 30 % de lípidos en 4 tiempos",
            "¿Cuál es su peso teórico y en cuántas semanas llegaría a su meta a 0.5 kg por semana?",
          ]}
          quick={[
            { label: "Resumen previo", text: "Dame el resumen previo: cómo llega y qué conviene revisar hoy" },
            { label: "Proponer plan", text: "Propón un plan de alimentación para el paciente. Si te falta la fórmula, la actividad o el objetivo de energía, pregúntamelo." },
            { label: "Cerrar consulta", text: "Cierra la consulta: redacta la nota SOAP con PES y el mensaje de resumen para el paciente con lo que vimos hoy." },
          ]} />
      </div>
    </div>
  );
}
