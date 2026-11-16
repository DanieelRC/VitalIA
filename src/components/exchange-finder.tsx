"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { groupColor } from "@/lib/groups";
import { Input, cn } from "./ui";

type Food = { name: string; portion: string; group_code: string | null; kcal: number };
type Group = { code: string; label: string };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/** "No tengo avena" → qué otros alimentos del mismo grupo equivalen a una porción. */
export function ExchangeFinder({ foods, groups, planGroups }: { foods: Food[]; groups: Group[]; planGroups: string[] }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Food | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const label = (code: string | null) => groups.find((g) => g.code === code)?.label ?? "Sin grupo";

  const matches = useMemo(() => (q.trim().length < 2 ? [] : foods.filter((f) => norm(f.name).includes(norm(q.trim()))).slice(0, 8)), [q, foods]);
  const activeGroup = picked?.group_code ?? group;
  const options = activeGroup ? foods.filter((f) => f.group_code === activeGroup && f.name !== picked?.name) : [];

  return (
    <div className="grid gap-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder="¿Qué alimento quieres cambiar? Ej. avena, tortilla, pollo" className="h-12 pl-9" aria-label="Buscar alimento" />
        {matches.length > 0 && !picked && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lift">
            {matches.map((f) => (
              <li key={f.name}>
                <button type="button" onClick={() => { setPicked(f); setGroup(null); setQ(f.name); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: groupColor(f.group_code) }} />
                  <span className="flex-1">{f.name}</span><span className="text-xs text-muted">{f.portion}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q.trim().length >= 2 && !matches.length && !picked && <p className="mt-2 text-sm text-muted">No encontré ese alimento. Prueba con otra palabra o elige un grupo abajo.</p>}
      </div>

      <div>
        <p className="mb-2 text-sm text-muted">O explora por grupo de tu plan:</p>
        <div className="flex flex-wrap gap-1.5">
          {groups.filter((g) => planGroups.includes(g.code)).map((g) => (
            <button key={g.code} type="button" onClick={() => { setGroup(g.code); setPicked(null); setQ(""); }}
              className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors", activeGroup === g.code ? "border-text bg-text text-bg" : "border-border hover:bg-surface-2")}>
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: groupColor(g.code) }} />{g.label}
            </button>
          ))}
        </div>
      </div>

      {activeGroup && (
        <section className="animate-enter rounded-2xl bg-surface-2 p-4" aria-live="polite">
          <h2 className="font-display text-lg font-bold">
            {picked ? <>En lugar de <span className="text-primary">{picked.portion} de {picked.name.toLowerCase()}</span> puedes comer</> : <>1 equivalente de {label(activeGroup)}</>}
          </h2>
          <p className="mb-3 text-sm text-muted">Cualquiera de estas porciones cuenta igual en tu plan ({label(activeGroup)}).</p>
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {options.map((f) => (
              <li key={f.name} className="flex justify-between gap-3 border-b border-border py-1.5 text-sm"><span>{f.name}</span><span className="shrink-0 text-muted">{f.portion}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
