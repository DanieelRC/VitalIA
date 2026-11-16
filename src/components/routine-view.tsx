import { Badge } from "./ui";

export type Routine = {
  id: string; name: string; type: string; level: string | null; goal: string | null; notes: string | null;
  items: { name: string; sets?: number; reps?: string; rest_s?: number; duration_min?: number; intensity?: string }[];
};

const TYPE: Record<string, string> = { aerobico: "Aeróbica", anaerobico: "Anaeróbica / fuerza", mixto: "Mixta" };

export function RoutineView({ r }: { r: Routine }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        <Badge tone="info">{TYPE[r.type] ?? r.type}</Badge>{r.level && <Badge>{r.level}</Badge>}
      </div>
      {r.goal && <p className="text-sm"><span className="text-muted">Objetivo:</span> {r.goal}</p>}
      <ol className="mt-2 divide-y divide-border text-sm">
        {r.items.map((it, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
            <span className="font-medium">{i + 1}. {it.name}</span>
            <span className="text-muted">
              {[it.sets && it.reps ? `${it.sets} × ${it.reps}` : it.reps, it.duration_min && `${it.duration_min} min`, it.rest_s && `descanso ${it.rest_s} s`, it.intensity]
                .filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ol>
      {r.notes && <p className="mt-2 text-sm text-muted">{r.notes}</p>}
    </div>
  );
}
