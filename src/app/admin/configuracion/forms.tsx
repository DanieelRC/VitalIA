"use client";
import { useActionState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { updatePlan, updateSettings, type ConfigResult } from "./actions";

const Msg = ({ s }: { s: ConfigResult }) =>
  s.error ? <p role="alert" className="text-xs text-danger">{s.error}</p> : s.ok ? <p role="status" className="text-xs text-primary">{s.ok}</p> : null;

type Plan = { code: string; name: string; price_mxn: number | null; max_patients: number | null; ai_budget_usd: number; active: boolean; subscribers: number };

export function PlanForm({ plan }: { plan: Plan }) {
  const [state, action, pending] = useActionState(updatePlan, {} as ConfigResult);
  return (
    <form action={action} className="flex flex-col gap-2.5 rounded-xl border border-border p-3.5"
      onSubmit={(e) => {
        const price = (e.currentTarget.elements.namedItem("price_mxn") as HTMLInputElement).value;
        if (plan.subscribers > 0 && price !== String(plan.price_mxn ?? "") &&
          !window.confirm(`${plan.subscribers} consultorio(s) pagan este plan. El precio nuevo solo aplica a contrataciones nuevas; para cambiárselo a ellos debes avisarles con 30 días. ¿Guardar?`)) e.preventDefault();
      }}>
      <input type="hidden" name="code" value={plan.code} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{plan.code} · {plan.subscribers} pagando</span>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="active" defaultChecked={plan.active} /> Disponible</label>
      </div>
      <Field label="Nombre"><Input name="name" defaultValue={plan.name} required maxLength={40} /></Field>
      <p className="-mt-1 text-xs text-muted">Precio mensual con IVA incluido. Pacientes vacío = ilimitados.</p>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Precio MXN"><Input name="price_mxn" type="number" min={0} step="1" defaultValue={plan.price_mxn ?? ""} /></Field>
        <Field label="Pacientes"><Input name="max_patients" type="number" min={1} defaultValue={plan.max_patients ?? ""} placeholder="∞" /></Field>
        <Field label="IA (USD/mes)"><Input name="ai_budget_usd" type="number" min={0} step="0.5" defaultValue={plan.ai_budget_usd} required /></Field>
      </div>
      <Field label="Motivo"><Input name="reason" required minLength={3} maxLength={500} /></Field>
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar plan"}</Button><Msg s={state} /></div>
    </form>
  );
}

type Settings = { default_trial_days: number; usd_mxn: number; announcement: string | null; announcement_tone: string };

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(updateSettings, {} as ConfigResult);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Días de prueba para nuevos registros"><Input name="default_trial_days" type="number" min={1} max={90} defaultValue={settings.default_trial_days} required /></Field>
      <Field label="Tipo de cambio USD → MXN" hint="Para estimar en pesos el costo de la IA."><Input name="usd_mxn" type="number" step="0.01" min={1} defaultValue={settings.usd_mxn} required /></Field>
      <Field label="Aviso para todos los nutriólogos" hint="Aparece arriba de su consultorio. Vacío = sin aviso." className="sm:col-span-2">
        <Textarea name="announcement" maxLength={300} rows={2} defaultValue={settings.announcement ?? ""} placeholder="Ej.: Mantenimiento programado el sábado de 22:00 a 23:00." />
      </Field>
      <Field label="Tono del aviso">
        <Select name="announcement_tone" defaultValue={settings.announcement_tone}><option value="info">Informativo</option><option value="warn">Importante</option></Select>
      </Field>
      <Field label="Motivo"><Input name="reason" required minLength={3} maxLength={500} /></Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar ajustes"}</Button><Msg s={state} /></div>
    </form>
  );
}
