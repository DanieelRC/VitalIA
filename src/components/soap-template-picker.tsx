"use client";
import { useRef } from "react";

export type SoapTemplate = { id: string; name: string; reason: string | null; subjective: string | null; objective: string | null; assessment: string | null; plan: string | null };
const FIELDS = ["reason", "subjective", "objective", "assessment", "plan"] as const;

/** Aplica una plantilla a la nota SOAP en borrador: llena los campos vacíos y agrega al final de los que ya tienen texto. */
export function SoapTemplatePicker({ templates }: { templates: SoapTemplate[] }) {
  const ref = useRef<HTMLSelectElement>(null);
  if (!templates.length) return null;
  const apply = (id: string) => {
    const t = templates.find((x) => x.id === id);
    const form = ref.current?.closest("section")?.querySelector("form");
    if (!t || !form) return;
    for (const f of FIELDS) {
      const el = form.elements.namedItem(f) as HTMLInputElement | HTMLTextAreaElement | null;
      const text = t[f];
      if (!el || !text) continue;
      el.value = el.value.trim() ? (f === "reason" ? el.value : `${el.value.trimEnd()}\n${text}`) : text;
    }
    if (ref.current) ref.current.value = "";
  };
  return (
    <select ref={ref} defaultValue="" aria-label="Aplicar una plantilla de nota" onChange={(e) => apply(e.target.value)}
      className="h-8 rounded-full border border-border bg-surface px-3 text-sm">
      <option value="">Aplicar plantilla…</option>
      {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
}
