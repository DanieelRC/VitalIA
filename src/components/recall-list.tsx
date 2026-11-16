import { Badge, Empty, fmtDate } from "./ui";
import { ConfirmButton } from "./form";
import { deleteRecall } from "@/lib/actions/r24h";

type Recall = { id: string; recall_date: string; captured_by: string; items: { meal: string; time?: string; description: string; kcal: number }[]; totals: Record<string, number>; notes: string | null };

export function RecallList({ recalls, canDelete }: { recalls: Recall[]; canDelete: (r: Recall) => boolean }) {
  if (!recalls.length) return <Empty>Sin recordatorios registrados.</Empty>;
  return (
    <div className="flex flex-col gap-3">
      {recalls.map((r) => (
        <details key={r.id} className="rounded-lg border border-border p-3">
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">{fmtDate(r.recall_date, { dateStyle: "full" })}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{Math.round(r.totals.kcal ?? 0)} kcal · P {r.totals.protein_g} · L {r.totals.fat_g} · HC {r.totals.carbs_g}</span>
              <Badge>{r.captured_by === "paciente" ? "Capturado por paciente" : "Entrevista"}</Badge>
            </span>
          </summary>
          <ul className="mt-2 divide-y divide-border text-sm">
            {r.items.map((i, k) => (
              <li key={k} className="flex justify-between gap-2 py-1"><span><span className="text-muted">{i.meal}{i.time ? ` ${i.time}` : ""}:</span> {i.description}</span><span className="tabular-nums">{i.kcal}</span></li>
            ))}
          </ul>
          {r.notes && <p className="mt-2 text-sm text-muted">{r.notes}</p>}
          {canDelete(r) && (
            <form action={async () => { "use server"; await deleteRecall(r.id); }} className="mt-2">
              <ConfirmButton message="¿Eliminar este recordatorio?">Eliminar</ConfirmButton>
            </form>
          )}
        </details>
      ))}
    </div>
  );
}
