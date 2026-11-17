"use client";
import { useState } from "react";
import { Lock, LockOpen, Scale, TriangleAlert, CircleCheck } from "lucide-react";
import {
  DEFAULT_RANGES, macroBalance, macroPresets, moveMacro, moveMacroGkg, moveMacroGrams, toggleLock,
  type MacroKey, type MacroState, type Status,
} from "@/lib/nutrition";
import { cn } from "@/components/ui";

export const MACRO_META: Record<MacroKey, { label: string; short: string; color: string }> = {
  protein: { label: "Proteína", short: "P", color: "var(--g-aoa)" },
  fat: { label: "Lípidos", short: "L", color: "var(--g-grasas)" },
  carbs: { label: "Hidratos de carbono", short: "HC", color: "var(--g-cereales)" },
};
const STATUS_TEXT: Record<Status, string> = { bajo: "bajo", normal: "en rango", alto: "alto" };
export type CustomMacroPreset = { id: string; name: string; protein_pct: number; fat_pct: number; carbs_pct: number; note?: string | null };

/** Campo numérico que no pelea con lo que se está escribiendo: confirma al cambiar a un número válido. */
export function NumField({ value, onCommit, step = 1, min = 0, max, suffix, label, className, disabled }: {
  value: number; onCommit: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; label: string; className?: string; disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{label}</span>
      <input
        type="number" inputMode="decimal" step={step} min={min} max={max} disabled={disabled} aria-label={label}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = Number(e.target.value.replace(",", "."));
          if (e.target.value !== "" && Number.isFinite(v) && v >= min && (max == null || v <= max)) onCommit(v);
        }}
        onBlur={() => setDraft(null)}
        className={cn("tabular h-9 w-full rounded-lg border border-border bg-surface pl-2 text-sm font-semibold transition-[border-color,box-shadow] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:bg-surface-2 disabled:text-muted", suffix ? "pr-9" : "pr-2")}
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">{suffix}</span>}
    </label>
  );
}

/**
 * Estudio de macronutrientes: cada macro se mueve con un deslizador o escribiendo %, gramos o g/kg.
 * Los candados fijan un macro en % o en gramos; los libres se reacomodan. El equilibrio se evalúa en vivo.
 */
export function MacroStudio({ kcal, weightKg, value, onChange, customPresets = [], onSavePreset }: {
  kcal: number; weightKg: number; value: MacroState; onChange: (s: MacroState) => void;
  customPresets?: CustomMacroPreset[]; onSavePreset?: (name: string) => void;
}) {
  const b = macroBalance(value, kcal, weightKg);
  const lockedCount = b.rows.filter((r) => r.lock).length;
  const apply = (p: { protein_pct: number; fat_pct: number; carbs_pct: number }) =>
    onChange({ pct: { protein: p.protein_pct, fat: p.fat_pct, carbs: p.carbs_pct }, locks: { protein: null, fat: null, carbs: null } });
  const activePreset = [...customPresets.map((p) => ({ label: p.name, pct: p, note: p.note })), ...macroPresets.map((p) => ({ label: p.label, pct: p.pct, note: p.note }))]
    .find((p) => p.pct.protein_pct === b.rows[0].pct && p.pct.fat_pct === b.rows[1].pct && p.pct.carbs_pct === b.rows[2].pct);

  const verdict = b.verdict === "equilibrada"
    ? { tone: "ok", title: "Distribución equilibrada", text: "Los tres macronutrientes están dentro de los rangos aceptables (AMDR) y suman 100 %." }
    : b.verdict === "descuadrada"
      ? { tone: "bad", title: `Suma ${b.sum} %`, text: `${b.unassignedKcal > 0 ? "Faltan" : "Sobran"} ${Math.abs(b.unassignedKcal)} kcal por ${b.unassignedKcal > 0 ? "asignar" : "quitar"}. Libera un candado o ajusta un macronutriente.` }
      : { tone: "warn", title: "Fuera de rango", text: b.rows.filter((r) => r.pctStatus !== "normal").map((r) => `${MACRO_META[r.key].label} ${STATUS_TEXT[r.pctStatus]} (${r.pct} %; aceptable ${DEFAULT_RANGES.pct[r.key].low}–${DEFAULT_RANGES.pct[r.key].high} %)`).join(" · ") };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Aplicar una distribución" value="" className="h-9 max-w-full rounded-full border border-border bg-surface px-3 text-sm"
            onChange={(e) => {
              const [kind, key] = e.target.value.split(":");
              const p = kind === "c" ? customPresets.find((x) => x.id === key) : macroPresets.find((x) => x.key === key)?.pct;
              if (p) apply(p);
            }}>
            <option value="">Aplicar una distribución…</option>
            {customPresets.length > 0 && <optgroup label="Mis distribuciones">{customPresets.map((p) => <option key={p.id} value={`c:${p.id}`}>{p.name} ({p.protein_pct}/{p.fat_pct}/{p.carbs_pct})</option>)}</optgroup>}
            <optgroup label="Distribuciones tipo">{macroPresets.map((p) => <option key={p.key} value={`b:${p.key}`}>{p.label} ({p.pct.protein_pct}/{p.pct.fat_pct}/{p.pct.carbs_pct})</option>)}</optgroup>
          </select>
          {onSavePreset && b.balanced && (
            <button type="button" className="h-9 rounded-full border border-border px-3 text-sm font-medium hover:bg-primary-soft/50"
              onClick={() => { const name = window.prompt("Nombre de la distribución", `${b.rows[0].pct}/${b.rows[1].pct}/${b.rows[2].pct}`); if (name?.trim()) onSavePreset(name.trim()); }}>
              Guardar como mía
            </button>
          )}
          {lockedCount > 0 && <span className="text-xs text-muted">{lockedCount === 1 ? "1 candado: el resto se reacomoda entre los otros dos." : lockedCount === 2 ? "2 candados: el macro libre absorbe todo." : "3 candados: nada se reacomoda."}</span>}
        </div>

        {b.rows.map((r) => {
          const m = MACRO_META[r.key], range = DEFAULT_RANGES.pct[r.key], gk = DEFAULT_RANGES.gkg[r.key];
          return (
            <div key={r.key} className="rounded-2xl border border-border bg-surface p-3 sm:p-4" style={{ ["--c" as string]: m.color }}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="size-3 rounded-full" style={{ background: m.color }} aria-hidden />
                <h3 className="font-display text-base font-bold">{m.label}</h3>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.pctStatus === "normal" ? "bg-primary-soft text-primary" : "bg-warn-soft text-warn")}>
                  {r.pct} % · {STATUS_TEXT[r.pctStatus]}
                </span>
                {weightKg > 0 && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.gkgStatus === "normal" ? "bg-surface-2 text-muted" : "bg-warn-soft text-warn")} title={`Referencia ${gk.low}–${gk.high} g/kg`}>
                    {r.gkg} g/kg · {STATUS_TEXT[r.gkgStatus]}
                  </span>
                )}
                <span className="tabular ml-auto text-xs text-muted">{r.kcal} kcal</span>
              </div>

              {/* Deslizador sobre su rango aceptable */}
              <div className="relative mt-3 h-7">
                <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-surface-2">
                  <div className="absolute inset-y-0 opacity-30" style={{ left: `${range.low}%`, width: `${range.high - range.low}%`, background: m.color }} />
                  <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150" style={{ width: `${Math.min(100, r.pct)}%`, background: m.color }} />
                </div>
                <input type="range" min={0} max={100} step={0.5} value={Math.min(100, r.pct)} disabled={!!r.lock}
                  aria-label={`${m.label} en porcentaje de la energía`} aria-valuetext={`${r.pct} %, ${r.g} gramos`}
                  onChange={(e) => onChange(moveMacro(value, r.key, Number(e.target.value)))} className="macro-slider absolute inset-0" />
              </div>
              <div className="relative h-4 text-[10px] text-muted tabular" aria-hidden>
                <span className="absolute -translate-x-1/2" style={{ left: `${range.low}%` }}>{range.low}</span>
                <span className="absolute -translate-x-1/2" style={{ left: `${range.high}%` }}>{range.high} %</span>
              </div>

              <div className="mt-1 grid grid-cols-[1fr_auto_1fr_1fr_auto] items-center gap-1.5">
                <NumField label={`${m.label} en porcentaje`} value={r.pct} step={0.5} max={100} suffix="%" disabled={!!r.lock} onCommit={(v) => onChange(moveMacro(value, r.key, v))} />
                <LockButton active={r.lock === "pct"} label={`Fijar ${m.label} en porcentaje`} onClick={() => onChange(toggleLock(value, r.key, "pct"))} />
                <NumField label={`${m.label} en gramos`} value={r.g} step={1} suffix="g" disabled={!!r.lock} onCommit={(v) => onChange(moveMacroGrams(value, r.key, v, kcal))} />
                <NumField label={`${m.label} en gramos por kilo`} value={r.gkg} step={0.05} suffix="g/kg" disabled={!!r.lock || weightKg <= 0} onCommit={(v) => onChange(moveMacroGkg(value, r.key, v, kcal, weightKg))} />
                <LockButton active={r.lock === "g"} label={`Fijar ${m.label} en gramos`} onClick={() => onChange(toggleLock(value, r.key, "g"))} />
              </div>
              {r.lock && <p className="mt-1.5 text-[11px] text-muted">{r.lock === "pct" ? "Fijo en porcentaje: conserva su % aunque cambie la energía." : "Fijo en gramos: conserva sus gramos (y g/kg) aunque cambie la energía."}</p>}
            </div>
          );
        })}
      </div>

      {/* Equilibrio en vivo */}
      <aside className="h-fit rounded-2xl border border-border bg-surface-2/60 p-4 lg:sticky lg:top-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Scale className="size-3.5" aria-hidden />Equilibrio</p>
        <div className="mt-3 flex h-10 overflow-hidden rounded-xl bg-surface" role="img" aria-label={b.rows.map((r) => `${MACRO_META[r.key].label} ${r.pct} %`).join(", ")}>
          {b.rows.map((r) => (
            <div key={r.key} style={{ width: `${(r.pct / Math.max(100, b.sum)) * 100}%`, background: MACRO_META[r.key].color }}
              className="flex items-center justify-center overflow-hidden text-[11px] font-bold text-white transition-[width] duration-200 ease-out-expo">
              {r.pct >= 9 && `${MACRO_META[r.key].short} ${Math.round(r.pct)}`}
            </div>
          ))}
        </div>
        <div className={cn("mt-3 rounded-xl p-3", verdict.tone === "ok" ? "bg-primary-soft text-primary" : verdict.tone === "warn" ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger")} role="status" aria-live="polite">
          <p className="flex items-center gap-1.5 font-display text-base font-bold">
            {verdict.tone === "ok" ? <CircleCheck className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}{verdict.title}
          </p>
          <p className="mt-1 text-xs leading-relaxed">{verdict.text}</p>
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          {b.rows.map((r) => (
            <div key={r.key} className="flex items-baseline justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-xs text-muted"><span className="size-2 rounded-full" style={{ background: MACRO_META[r.key].color }} />{MACRO_META[r.key].label}</dt>
              <dd className="tabular font-semibold">{r.g} g <span className="text-xs font-normal text-muted">· {r.gkg} g/kg</span></dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-2 border-t border-border pt-1.5">
            <dt className="text-xs text-muted">Energía asignada</dt>
            <dd className="tabular font-semibold">{Math.round(kcal - b.unassignedKcal)} <span className="text-xs font-normal text-muted">de {Math.round(kcal)} kcal</span></dd>
          </div>
        </dl>
        {activePreset?.note && <p className="mt-3 rounded-lg bg-info-soft p-2 text-xs text-info">{activePreset.label}: {activePreset.note}</p>}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">Rangos AMDR (IOM): proteína 10–35 %, lípidos 20–35 %, hidratos 45–65 %. Una distribución terapéutica puede salirse a propósito.</p>
      </aside>
    </div>
  );
}

function LockButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} aria-label={label} title={label}
      className={cn("grid size-9 place-items-center rounded-lg border transition-colors", active ? "border-primary bg-primary text-primary-fg" : "border-border text-muted hover:border-primary/50 hover:text-text")}>
      {active ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
    </button>
  );
}
