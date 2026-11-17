"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAdminAction, requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export type ConfigResult = { ok?: string; error?: string };

const optNum = (min: number, max: number) => z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(min).max(max).nullable());

const PlanForm = z.object({
  code: z.enum(["p5", "p10", "p20", "pmax"]),
  name: z.string().trim().min(1).max(40),
  price_mxn: optNum(0, 100000),
  max_patients: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(100000).nullable()),
  ai_budget_usd: z.coerce.number().min(0).max(1000),
  active: z.preprocess((v) => v === "on", z.boolean()),
  reason: z.string().trim().min(3, "Escribe el motivo (queda en la bitácora).").max(500),
});

/** Edita un plan. Un precio nuevo aplica a contrataciones nuevas: Stripe crea otro Price con su propia lookup key. */
export async function updatePlan(_: ConfigResult, fd: FormData): Promise<ConfigResult> {
  const s = await requireAdmin();
  const p = PlanForm.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Revisa los datos." };
  const { code, reason, ...values } = p.data;
  const admin = createAdminClient();
  const { data: before } = await admin.from("plans").select("*").eq("code", code).single();
  const { data: after, error } = await admin.from("plans").update(values).eq("code", code).select("*").single();
  if (error) return { error: error.message };
  await logAdminAction({ adminId: s.userId, action: "plan_edit", reason: `${code}: ${reason}`, before, after });
  revalidatePath("/", "layout");
  return { ok: "Plan guardado." };
}

const SettingsForm = z.object({
  default_trial_days: z.coerce.number().int().min(1).max(90),
  usd_mxn: z.coerce.number().min(1).max(100),
  announcement: z.string().trim().max(300),
  announcement_tone: z.enum(["info", "warn"]),
  reason: z.string().trim().min(3, "Escribe el motivo (queda en la bitácora).").max(500),
});

/** Ajustes generales: días de prueba para nuevos registros, tipo de cambio y aviso global a nutriólogos. */
export async function updateSettings(_: ConfigResult, fd: FormData): Promise<ConfigResult> {
  const s = await requireAdmin();
  const p = SettingsForm.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Revisa los datos." };
  const { reason, announcement, ...rest } = p.data;
  const admin = createAdminClient();
  const { data: before } = await admin.from("platform_settings").select("*").eq("id", 1).single();
  const { data: after, error } = await admin.from("platform_settings")
    .update({ ...rest, announcement: announcement || null, updated_at: new Date().toISOString() }).eq("id", 1).select("*").single();
  if (error) return { error: error.message };
  await logAdminAction({ adminId: s.userId, action: "settings", reason, before, after });
  revalidatePath("/", "layout");
  return { ok: "Ajustes guardados." };
}
