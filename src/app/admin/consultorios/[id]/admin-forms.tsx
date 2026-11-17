"use client";
import { useActionState, type ReactNode } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { runAdminAction, type AdminResult } from "./actions";

/** Formulario de una acción del admin: campos propios + motivo obligatorio. */
function ActionForm({ clinicId, op, title, help, submit, danger, confirm, children }: {
  clinicId: string; op: string; title: string; help?: string; submit: string; danger?: boolean; confirm?: string; children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(runAdminAction, {} as AdminResult);
  return (
    <form action={action} className="flex flex-col gap-2.5 rounded-xl border border-border p-3.5"
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      <input type="hidden" name="clinic_id" value={clinicId} />
      <input type="hidden" name="op" value={op} />
      <div>
        <h3 className="font-semibold">{title}</h3>
        {help && <p className="text-xs text-muted">{help}</p>}
      </div>
      {children}
      <Field label="Motivo"><Input name="reason" required minLength={3} maxLength={500} placeholder="Queda en la bitácora" /></Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant={danger ? "secondary" : "primary"} disabled={pending}>{pending ? "Aplicando…" : submit}</Button>
        {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
        {state.ok && <p role="status" className="text-xs text-primary">{state.ok}</p>}
      </div>
    </form>
  );
}

const Until = () => (
  <div className="grid grid-cols-2 gap-2">
    <Field label="Días"><Input name="days" type="number" min={1} max={366} placeholder="30" /></Field>
    <Field label="o hasta"><Input name="until" type="date" /></Field>
  </div>
);

export function AdminActions({ clinicId, paying, inComp, plan, aiOverride, planCap, unconfirmed }: {
  clinicId: string; paying: boolean; inComp: boolean; plan: string; aiOverride: number | null; planCap: number; unconfirmed: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ActionForm clinicId={clinicId} op="trial" title="Dar o extender prueba gratis" submit="Dar prueba"
        help={paying ? "Tiene suscripción pagada: se pausan sus cobros hasta esa fecha (Stripe)." : "Queda en prueba con todas las funciones de su plan hasta la fecha."}>
        <Until />
      </ActionForm>
      {!paying && (
        <ActionForm clinicId={clinicId} op="comp" title="Dar cortesía" submit="Dar cortesía" help="Activo sin cobro hasta la fecha (beta testers, aliados, compensaciones).">
          <Until />
        </ActionForm>
      )}
      <ActionForm clinicId={clinicId} op="plan" title="Cambiar plan" submit="Cambiar plan" help={paying ? "Se cambia también en Stripe, con prorrateo en el siguiente recibo." : undefined}>
        <Field label="Plan">
          <Select name="plan" defaultValue={plan}>
            <option value="p5">Inicio (5)</option><option value="p10">Crecimiento (10)</option><option value="p20">Profesional (20)</option><option value="pmax">Ilimitado</option>
          </Select>
        </Field>
      </ActionForm>
      <ActionForm clinicId={clinicId} op="ai_budget" title="Tope de IA propio" submit="Guardar tope" help={`Vacío = el del plan ($${planCap} USD al mes).`}>
        <Field label="USD al mes"><Input name="ai_budget" type="number" min={0} max={1000} step="0.5" defaultValue={aiOverride ?? ""} /></Field>
      </ActionForm>
      {!paying && (
        <ActionForm clinicId={clinicId} op="reactivate" title="Activar sin cobro" submit="Activar" help="Sin fecha de vencimiento (cuentas fundadoras o internas)."
          confirm="¿Activar este consultorio sin cobro y sin vencimiento?" />
      )}
      {inComp && <ActionForm clinicId={clinicId} op="comp_remove" title="Retirar cortesía" submit="Retirar" danger confirm="¿Retirar la cortesía? El consultorio quedará vencido." />}
      {!paying && <ActionForm clinicId={clinicId} op="suspend" title="Suspender" submit="Suspender" danger help="Conserva su información, pero no puede agregar pacientes ni usar la IA."
        confirm="¿Suspender este consultorio?" />}
      {unconfirmed && <ActionForm clinicId={clinicId} op="resend_confirmation" title="Reenviar confirmación de correo" submit="Reenviar" />}
    </div>
  );
}
