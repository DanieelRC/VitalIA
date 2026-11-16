"use client";
import { useEffect, useState } from "react";
import { FAMILY_LABEL, FAMILY_ORDER, familyColor, type GroupFamily } from "@/lib/groups";
import type { ShoppingItem } from "@/lib/shopping";
import { Button, cn } from "./ui";

const fmtQty = (i: ShoppingItem) => (i.quantity == null ? "" : `${i.quantity.toLocaleString("es-MX")} ${i.unit}`.trim());

/** Lista del súper con casillas. Lo marcado se guarda en este dispositivo. */
export function ShoppingList({ items, storageKey }: { items: ShoppingItem[]; storageKey: string }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { setDone(new Set(JSON.parse(localStorage.getItem(storageKey) ?? "[]"))); } catch { /* sin almacenamiento */ }
  }, [storageKey]);
  const toggle = (key: string) => setDone((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* sin almacenamiento */ }
    return next;
  });
  const clear = () => { setDone(new Set()); try { localStorage.removeItem(storageKey); } catch { /* sin almacenamiento */ } };

  const families = [...FAMILY_ORDER.filter((f) => f !== "libres"), "otros" as const];
  const left = items.filter((i) => !done.has(i.key)).length;

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted" aria-live="polite">{left === 0 ? "¡Todo listo!" : `Te faltan ${left} de ${items.length}`}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => window.print()}>Imprimir</Button>
          <Button size="sm" variant="ghost" onClick={clear} disabled={done.size === 0}>Desmarcar todo</Button>
        </div>
      </div>
      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
        {families.map((f) => {
          const group = items.filter((i) => i.family === f);
          if (!group.length) return null;
          return (
            <section key={f}>
              <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
                <span aria-hidden className="size-3 rounded-full" style={{ background: f === "otros" ? "var(--g-libres)" : familyColor(f as GroupFamily) }} />
                {f === "otros" ? "Despensa y otros" : FAMILY_LABEL[f as GroupFamily]}
              </h2>
              <ul className="divide-y divide-border">
                {group.map((i) => (
                  <li key={i.key}>
                    <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                      <input type="checkbox" className="size-4.5 shrink-0" checked={done.has(i.key)} onChange={() => toggle(i.key)} />
                      <span className={cn("min-w-0 flex-1 transition-opacity duration-200", done.has(i.key) && "text-muted line-through opacity-60")}>{i.name}</span>
                      <span className="tabular shrink-0 text-muted">{fmtQty(i)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
