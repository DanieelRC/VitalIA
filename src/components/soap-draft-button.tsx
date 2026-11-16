"use client";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { draftSoap, type SoapDraft } from "@/lib/actions/soap-draft";
import { Alert, Button } from "./ui";

const FIELDS = ["subjective", "objective", "assessment", "plan"] as const;

/** Pide un borrador de la nota a la IA y lo coloca en los campos S/O/A/P para revisarlo. No guarda ni firma nada. */
export function SoapDraftButton({ patientId, consultationId }: { patientId: string; consultationId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pes, setPes] = useState<SoapDraft["pes"]>([]);
  const [done, setDone] = useState(false);

  const run = () => start(async () => {
    setError(null); setDone(false);
    const res = await draftSoap(patientId, consultationId);
    if (!res.draft) return setError(res.error ?? "No se pudo generar el borrador.");
    for (const f of FIELDS) {
      const el = document.querySelector<HTMLTextAreaElement>(`textarea[name="${f}"]`);
      const text = res.draft[f];
      if (!el || !text) continue;
      // Lo ya escrito se conserva: el borrador se agrega debajo
      el.value = el.value.trim() ? `${el.value.trim()}\n\n[Borrador IA]\n${text}` : text;
    }
    setPes(res.draft.pes);
    setDone(true);
  });

  return (
    <div className="grid gap-3 rounded-2xl bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted">
          Redacta un borrador con las notas rápidas, la antropometría, los registros del paciente y sus laboratorios. Se envía a xAI sin nombre ni datos de contacto.
        </p>
        <Button type="button" variant="secondary" onClick={run} disabled={pending}><Sparkles className="size-4" />{pending ? "Redactando…" : "Borrador con IA"}</Button>
      </div>
      {error && <Alert tone="warn">{error}</Alert>}
      {done && <Alert tone="info">Borrador colocado en los campos. <strong>Revísalo y corrígelo antes de guardar</strong>: la IA puede equivocarse y la nota es tu responsabilidad profesional.</Alert>}
      {pes.length > 0 && (
        <div className="text-sm">
          <p className="mb-1 font-semibold">Diagnósticos PES sugeridos (agrégalos abajo si aplican)</p>
          <ul className="grid gap-1">{pes.map((d, i) => <li key={i}><strong>{d.problem}</strong> relacionado con <em>{d.etiology}</em>, evidenciado por {d.signs}.</li>)}</ul>
        </div>
      )}
    </div>
  );
}
