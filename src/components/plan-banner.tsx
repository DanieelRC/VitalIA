import Link from "next/link";
import { getSubscription } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/components/ui";

/** Aviso global que VitalIA publica desde el panel de administración. */
async function Announcement() {
  const { data } = await (await createClient()).from("platform_settings").select("announcement, announcement_tone").maybeSingle();
  if (!data?.announcement) return null;
  return (
    <div role="status" className={cn("mb-3 rounded-xl px-3.5 py-2.5 text-sm", data.announcement_tone === "warn" ? "bg-warn-soft text-warn" : "bg-info-soft text-info")}>
      <strong className="font-semibold">VitalIA: </strong>{data.announcement}
    </div>
  );
}

export async function PlanBanner() {
  return <><Announcement /><SubscriptionBanner /></>;
}

/** Aviso discreto sobre la suscripción: prueba por vencer, vencida, cortesía o cerca del límite de pacientes. */
async function SubscriptionBanner() {
  const sub = await getSubscription();
  if (!sub) return null;
  const max = sub.plan.max_patients;
  let tone: "warn" | "danger" | "info" | null = null, text = "";
  if (!sub.active) {
    tone = "danger";
    text = sub.status === "prueba" ? "Tu periodo de prueba terminó. Puedes consultar todo, pero no agregar pacientes." : "Tu suscripción no está vigente. Puedes consultar todo, pero no agregar pacientes.";
  } else if (sub.paymentFailedAt) {
    tone = "danger";
    text = "No pudimos cobrar tu suscripción. Actualiza tu tarjeta para no perder el acceso.";
  } else if (max != null && sub.activePatients >= max) {
    tone = "warn";
    text = `Llegaste al límite de tu plan: ${sub.activePatients} de ${max} pacientes activos.`;
  } else if (sub.compUntil && sub.daysLeft != null && sub.daysLeft <= 7) {
    tone = "info";
    text = `Tu cortesía de VitalIA termina en ${Math.max(sub.daysLeft, 1)} día${sub.daysLeft > 1 ? "s" : ""}. Suscríbete para no perder el acceso.`;
  } else if (sub.status === "prueba" && sub.daysLeft != null && sub.daysLeft <= 7) {
    tone = "info";
    text = sub.daysLeft <= 1 ? "Tu prueba termina hoy." : `Te quedan ${sub.daysLeft} días de prueba.`;
  } else if (max != null && sub.activePatients >= max - 1) {
    tone = "info";
    text = `Tienes ${sub.activePatients} de ${max} pacientes activos en tu plan.`;
  }
  if (!tone) return null;
  return (
    <div className={cn("mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-sm",
      tone === "danger" ? "bg-danger-soft text-danger" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-info-soft text-info")}>
      <span>{text}</span>
      <Link href="/consultorio/suscripcion" className="font-semibold underline-offset-2 hover:underline">Ver suscripción</Link>
    </div>
  );
}
