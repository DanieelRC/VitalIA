import { Alert, Badge, Card, fmtDateTime, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { cfdiConfigured } from "@/lib/billing/cfdi";
import { billingConfigured, billingTestMode } from "@/lib/billing/stripe";
import { LEGAL } from "@/lib/legal";
import { createAdminClient } from "@/lib/supabase/server";
import { PlanForm, SettingsForm } from "./forms";

export const metadata = { title: "Facturación y planes" };

function Check({ label, ok, detail, warn }: { label: string; ok: boolean; detail?: React.ReactNode; warn?: boolean }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 border-t border-border py-2.5 text-sm first:border-t-0">
      <span><span className="font-semibold">{label}</span>{detail && <span className="block text-xs text-muted">{detail}</span>}</span>
      <Badge tone={ok ? (warn ? "warn" : "primary") : "danger"}>{ok ? (warn ? "Revisar" : "Listo") : "Falta"}</Badge>
    </li>
  );
}

export default async function Config() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: plans }, { data: settings }, { data: lastEvent }, { data: paying }] = await Promise.all([
    admin.from("plans").select("code, name, price_mxn, max_patients, ai_budget_usd, active").order("sort"),
    admin.from("platform_settings").select("default_trial_days, usd_mxn, announcement, announcement_tone").eq("id", 1).single(),
    admin.from("billing_events").select("type, received_at").order("received_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("clinics").select("plan").not("stripe_subscription_id", "is", null),
  ]);
  const env = process.env;
  const webhook = env.STRIPE_WEBHOOK_SECRET ?? "";
  const live = !billingTestMode();
  const facturapiTest = /^sk_test_/.test(env.FACTURAPI_KEY ?? "");

  return (
    <>
      <PageHeader title="Facturación y planes" subtitle="Integraciones, precios y ajustes de la plataforma" />
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Cobro (Stripe)">
            <ul>
              <Check label="Llave secreta" ok={billingConfigured()} detail={!env.STRIPE_SECRET_KEY ? "Pon STRIPE_SECRET_KEY en .env.local" : live ? (env.BILLING_ALLOW_LIVE === "1" ? "Llave LIVE: cobros reales activos" : "Llave live bloqueada (falta BILLING_ALLOW_LIVE=1)") : "Modo prueba: sin cargos reales"} warn={live} />
              <Check label="Webhook" ok={!!webhook} detail={!webhook ? "Pon STRIPE_WEBHOOK_SECRET" : webhook.startsWith("whsec_local") ? "Secreto local de pruebas: reemplázalo por el de `stripe listen` o del Dashboard" : "Configurado"} warn={webhook.startsWith("whsec_local")} />
              <Check label="Último evento recibido" ok={!!lastEvent} detail={lastEvent ? `${lastEvent.type} · ${fmtDateTime(lastEvent.received_at)}` : "Aún no llega ningún evento de Stripe"} />
            </ul>
          </Card>
          <Card title="Facturación (Facturapi · CFDI 4.0)">
            <ul>
              <Check label="Llave de Facturapi" ok={cfdiConfigured()} detail={!env.FACTURAPI_KEY ? "Pon FACTURAPI_KEY en .env.local" : facturapiTest ? "Modo prueba: facturas sin validez fiscal" : "Llave live"} warn={!facturapiTest && cfdiConfigured()} />
              <Check label="Datos del emisor (VitalIA)" ok={!LEGAL.draft} detail={`${LEGAL.company} · ${LEGAL.address}`} warn={LEGAL.draft} />
              <Check label="Correo de envío (Resend)" ok={!!env.RESEND_API_KEY && !!env.EMAIL_FROM} detail="Confirmaciones, avisos de renovación y de cobro rechazado" />
              <Check label="Cron diario" ok={(env.CRON_SECRET ?? "").length >= 16} detail="Cierra periodos y envía avisos de renovación" />
            </ul>
            <p className="mt-3 text-xs text-muted">Los datos fiscales de emisor se configuran en el panel de Facturapi; aquí solo se muestra lo que usan los avisos legales.</p>
          </Card>
        </div>

        <Card title="Planes">
          <Alert tone="info">Los cambios de precio aplican a nuevas contrataciones. Los términos obligan a avisar con 30 días a quien ya paga antes de cambiar su precio.</Alert>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {(plans ?? []).map((p) => (
              <PlanForm key={p.code} plan={{ ...p, price_mxn: p.price_mxn == null ? null : Number(p.price_mxn), ai_budget_usd: Number(p.ai_budget_usd), subscribers: (paying ?? []).filter((c) => c.plan === p.code).length }} />
            ))}
          </div>
        </Card>

        <Card title="Plataforma">
          <SettingsForm settings={{ ...settings!, usd_mxn: Number(settings!.usd_mxn) }} />
        </Card>
      </div>
    </>
  );
}
