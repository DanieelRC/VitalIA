"use client";
import { useActionState, useState, useTransition } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { CFDI_USES, TAX_REGIMES } from "@/lib/billing/map";
import { changePlan, choosePlan, openPortal, retryCfdi, saveBillingProfile, startCheckout, type ChooseResult } from "./actions";

type Mode = "trial" | "subscribe" | "change";

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ChooseResult>({});
  const run = (fn: () => Promise<ChooseResult>) => start(async () => {
    const r = await fn();
    if (r.url) { window.location.assign(r.url); return; }
    setMsg(r);
  });
  return { pending, msg, run };
}

const Msg = ({ msg }: { msg: ChooseResult }) =>
  msg.error ? <p role="alert" className="text-xs text-danger">{msg.error}</p> : msg.ok ? <p role="status" className="text-xs text-primary">{msg.ok}</p> : null;

/** Botón de cada plan: probarlo en la prueba, suscribirse con Stripe o cambiar la suscripción pagada. */
export function PlanChoice({ code, name, price, current, disabled, mode, billing }: {
  code: string; name: string; price: number | null; current: boolean; disabled?: boolean; mode: Mode; billing: boolean;
}) {
  const { pending, msg, run } = useAction();
  if (current && mode !== "subscribe") return <p className="text-sm font-semibold text-primary">Tu plan actual</p>;
  const priceLabel = price != null ? `$${price.toLocaleString("es-MX")} MXN al mes, IVA incluido` : "";
  const onClick = () => {
    if (mode === "trial") return run(() => choosePlan(code));
    if (mode === "subscribe") return run(() => startCheckout(code));
    if (!window.confirm(`¿Cambiar al plan ${name} (${priceLabel})? Si subes de plan, se cobra hoy la parte proporcional; si bajas, la diferencia se abona a tu siguiente recibo.`)) return;
    run(() => changePlan(code));
  };
  const label = mode === "trial" ? "Probar este plan" : mode === "subscribe" ? (current ? "Suscribirme a mi plan" : "Suscribirme") : "Cambiar a este plan";
  return (
    <div className="flex flex-col gap-1.5">
      <Button size="sm" variant={mode === "subscribe" ? "primary" : "secondary"} disabled={disabled || pending || (mode !== "trial" && !billing)} onClick={onClick}>
        {pending ? "Un momento…" : label}
      </Button>
      <Msg msg={msg} />
    </div>
  );
}

/** Durante la prueba: suscribirse al plan actual sin perder los días restantes. */
export function ActivateButton({ code, price, billing }: { code: string; price: number | null; billing: boolean }) {
  const { pending, msg, run } = useAction();
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button size="sm" disabled={!billing || price == null || pending} onClick={() => run(() => startCheckout(code))}>
        {pending ? "Abriendo pago…" : `Activar suscripción${price != null ? ` · $${price.toLocaleString("es-MX")}/mes` : ""}`}
      </Button>
      <Msg msg={msg} />
    </div>
  );
}

export function PortalButton() {
  const { pending, msg, run } = useAction();
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(openPortal)}>{pending ? "Abriendo…" : "Tarjeta y recibos"}</Button>
      <Msg msg={msg} />
    </div>
  );
}

export function RetryCfdi({ id }: { id: string }) {
  const { pending, msg, run } = useAction();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className="text-xs font-semibold text-primary hover:underline disabled:opacity-50" disabled={pending} onClick={() => run(() => retryCfdi(id))}>
        {pending ? "Facturando…" : "Facturar"}
      </button>
      <Msg msg={msg} />
    </span>
  );
}

type Profile = { rfc: string; legal_name: string; tax_regime: string; zip: string; cfdi_use: string; email: string | null } | null;

/** Datos fiscales del titular, como aparecen en su Constancia de Situación Fiscal. */
export function FiscalForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(saveBillingProfile, {} as ChooseResult);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="RFC"><Input name="rfc" required defaultValue={profile?.rfc} maxLength={13} autoComplete="off" className="uppercase" /></Field>
      <Field label="Razón social o nombre" hint="Sin «S.A. de C.V.» ni otro régimen societario, igual que en tu constancia.">
        <Input name="legal_name" required defaultValue={profile?.legal_name} maxLength={300} className="uppercase" />
      </Field>
      <Field label="Régimen fiscal">
        <Select name="tax_regime" required defaultValue={profile?.tax_regime ?? ""}>
          <option value="" disabled>Elige…</option>
          {Object.entries(TAX_REGIMES).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
        </Select>
      </Field>
      <Field label="Código postal fiscal"><Input name="zip" required defaultValue={profile?.zip} inputMode="numeric" pattern="\d{5}" maxLength={5} /></Field>
      <Field label="Uso del CFDI">
        <Select name="cfdi_use" defaultValue={profile?.cfdi_use ?? "G03"}>
          {Object.entries(CFDI_USES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Correo para facturas" hint="Si lo dejas vacío, usamos el del consultorio.">
        <Input name="email" type="email" defaultValue={profile?.email ?? ""} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar datos fiscales"}</Button>
        <Msg msg={state} />
      </div>
    </form>
  );
}
