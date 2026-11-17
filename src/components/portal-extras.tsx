"use client";
import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Check, Scale } from "lucide-react";
import { quickWeight } from "@/lib/actions/day";
import { PlateMark } from "./plate";
import { Button, cn } from "./ui";

/** Registrar el peso de hoy sin salir del inicio. */
export function QuickWeight({ last }: { last: number | null }) {
  const [v, setV] = useState("");
  const [state, setState] = useState<"idle" | "ok" | string>("idle");
  const [pending, start] = useTransition();
  const kg = Number(v.replace(",", "."));
  const valid = v !== "" && Number.isFinite(kg) && kg >= 20 && kg <= 400;
  return (
    <form className="rounded-2xl border border-border bg-surface p-4 shadow-soft"
      onSubmit={(e) => { e.preventDefault(); if (!valid) return; start(async () => { const r = await quickWeight(kg); setState(r.error ?? "ok"); if (!r.error) setV(""); }); }}>
      <label htmlFor="quick-weight" className="flex items-center gap-2 text-sm text-muted"><Scale className="size-5" />Registrar mi peso de hoy</label>
      <div className="mt-2 flex items-center gap-2">
        <div className="relative flex-1">
          <input id="quick-weight" inputMode="decimal" value={v} onChange={(e) => { setV(e.target.value); setState("idle"); }} placeholder={last ? String(last) : "0.0"}
            className="tabular h-11 w-full rounded-xl border border-border bg-surface pl-3 pr-10 font-display text-xl font-bold focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">kg</span>
        </div>
        <Button type="submit" disabled={!valid || pending}>{pending ? "…" : "Guardar"}</Button>
      </div>
      <p className={cn("mt-1.5 text-xs", state === "ok" ? "text-primary" : state === "idle" ? "text-muted" : "text-danger")} role="status">
        {state === "ok" ? <span className="flex items-center gap-1"><Check className="size-3.5" />Guardado. Lo verás en tu progreso.</span> : state === "idle" ? "De preferencia en ayunas y a la misma hora." : state}
      </p>
    </form>
  );
}

const STEPS = [
  { title: "Te damos la bienvenida", text: "Aquí vas a encontrar lo que tu nutriólogo preparó para ti. Te mostramos lo esencial en cuatro pasos." },
  { title: "Tu día, de un vistazo", text: "En Inicio ves qué te toca comer hoy. Toca «Ya comí» al terminar cada comida y verás qué grupos de alimentos te faltan." },
  { title: "¿No se te antoja?", text: "Con «Cambiar» eliges otro platillo parecido solo por hoy, y en Intercambios cambias un alimento por otro del mismo grupo." },
  { title: "Registra y pregunta", text: "Anota tu peso y tu agua en segundos. Si tienes dudas, Vita te responde sobre tu plan y tu nutriólogo está en Mensajes." },
];
const KEY = "vitalia_tour_v1";

/** Recorrido de primera vez. Se muestra una sola vez por dispositivo y se puede saltar. */
export function WelcomeTour() {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setStep(0); } catch { /* sin almacenamiento: no se muestra */ }
  }, []);
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch { /* nada */ } setStep(null); };
  useEffect(() => {
    if (step == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);
  if (step == null) return null;
  const s = STEPS[step], last = step === STEPS.length - 1;
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-4 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="animate-enter w-full max-w-md rounded-3xl bg-surface p-6 shadow-lift">
        <div className="flex items-center justify-between">
          <PlateMark size={36} />
          <button type="button" onClick={close} className="rounded-full px-3 py-1 text-sm text-muted hover:bg-surface-2">Saltar</button>
        </div>
        <h2 id="tour-title" className="mt-4 font-display text-2xl font-extrabold tracking-tight">{s.title}</h2>
        <p className="mt-2 leading-relaxed text-muted">{s.text}</p>
        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5" aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
            {STEPS.map((_, i) => <span key={i} className={cn("h-1.5 rounded-full transition-all duration-300", i === step ? "w-6 bg-primary" : "w-1.5 bg-border")} />)}
          </div>
          <Button autoFocus onClick={() => (last ? close() : setStep(step + 1))}>{last ? "Empezar" : <>Siguiente <ArrowRight className="size-4" /></>}</Button>
        </div>
      </div>
    </div>
  );
}
