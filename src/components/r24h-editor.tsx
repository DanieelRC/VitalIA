"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Field, Input, Select, Textarea } from "./ui";
import { adequacy } from "@/lib/nutrition";

export type Food = { id: string; name: string; portion: string; group_code: string | null; kcal: number; protein_g: number; fat_g: number; carbs_g: number };
export type RecallItem = {
  meal: string; time?: string; place?: string; description: string; food_id?: string | null; quantity: number;
  kcal: number; protein_g: number; fat_g: number; carbs_g: number; group_code?: string | null;
};
export type RecallPayload = { recall_date: string; items: RecallItem[]; notes: string };

const MEALS = ["Desayuno", "Colación matutina", "Comida", "Colación vespertina", "Cena", "Otro"];
const r1 = (x: number) => Math.round(x * 10) / 10;

export function R24hEditor({ foods, target, save }: {
  foods: Food[];
  target?: { kcal: number; protein_g: number; fat_g: number; carbs_g: number } | null;
  save: (p: RecallPayload) => Promise<{ error?: string; ok?: string }>;
}) {
  const [date, setDate] = useState(() => new Date(Date.now() - 864e5).toISOString().slice(0, 10));
  const [items, setItems] = useState<RecallItem[]>([]);
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState({ meal: "Desayuno", time: "", place: "", query: "", quantity: "1" });
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();

  const byName = new Map(foods.map((f) => [f.name.toLowerCase(), f]));
  const add = () => {
    const q = draft.query.trim();
    if (!q) return;
    const f = byName.get(q.toLowerCase());
    const qty = Number(draft.quantity) || 1;
    setItems((list) => [...list, {
      meal: draft.meal, time: draft.time, place: draft.place, quantity: qty,
      description: f ? `${f.name} (${qty} × ${f.portion})` : q,
      food_id: f?.id ?? null, group_code: f?.group_code ?? null,
      kcal: f ? r1(f.kcal * qty) : 0, protein_g: f ? r1(f.protein_g * qty) : 0, fat_g: f ? r1(f.fat_g * qty) : 0, carbs_g: f ? r1(f.carbs_g * qty) : 0,
    }]);
    setDraft({ ...draft, query: "", quantity: "1" });
  };

  const totals = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein_g: a.protein_g + i.protein_g, fat_g: a.fat_g + i.fat_g, carbs_g: a.carbs_g + i.carbs_g }),
    { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Día que se recuerda"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="grid gap-2 rounded-lg bg-surface-2 p-3 sm:grid-cols-[150px_90px_1fr_80px_auto] sm:items-end">
        <Field label="Tiempo"><Select value={draft.meal} onChange={(e) => setDraft({ ...draft, meal: e.target.value })}>{MEALS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Hora"><Input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></Field>
        <Field label="Alimento o preparación" hint="Elige de la lista para calcular automáticamente, o escribe libremente">
          <Input list="r24h-foods" value={draft.query} onChange={(e) => setDraft({ ...draft, query: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        </Field>
        <Field label="Porciones"><Input inputMode="decimal" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} /></Field>
        <Button type="button" onClick={add} aria-label="Agregar"><Plus className="size-4" /> Agregar</Button>
        <datalist id="r24h-foods">{foods.map((f) => <option key={f.id} value={f.name}>{f.portion}</option>)}</datalist>
      </div>

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted"><th className="py-2">Tiempo</th><th>Alimento</th><th className="text-right">kcal</th><th className="text-right">P</th><th className="text-right">L</th><th className="text-right">HC</th><th /></tr></thead>
            <tbody className="divide-y divide-border">
              {items.map((i, idx) => (
                <tr key={idx}>
                  <td className="py-1.5">{i.meal}{i.time && <span className="block text-xs text-muted">{i.time}</span>}</td>
                  <td>{i.description}{!i.food_id && <Badge tone="warn">sin cálculo</Badge>}</td>
                  <td className="text-right tabular-nums">{i.kcal}</td><td className="text-right tabular-nums">{i.protein_g}</td>
                  <td className="text-right tabular-nums">{i.fat_g}</td><td className="text-right tabular-nums">{i.carbs_g}</td>
                  <td className="text-right"><button className="p-1 text-muted hover:text-danger" aria-label="Quitar" onClick={() => setItems((l) => l.filter((_, j) => j !== idx))}><Trash2 className="size-4" /></button></td>
                </tr>
              ))}
              <tr className="font-semibold"><td colSpan={2} className="py-2">Total</td><td className="text-right">{Math.round(totals.kcal)}</td><td className="text-right">{r1(totals.protein_g)}</td><td className="text-right">{r1(totals.fat_g)}</td><td className="text-right">{r1(totals.carbs_g)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}

      {target && items.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([["Energía", totals.kcal, target.kcal], ["Proteína", totals.protein_g, target.protein_g], ["Lípidos", totals.fat_g, target.fat_g], ["Hidratos", totals.carbs_g, target.carbs_g]] as const).map(([l, got, t]) => {
            const a = adequacy(got, t);
            return <div key={l} className="rounded-lg bg-surface-2 p-2 text-sm"><p className="text-xs text-muted">{l} vs plan</p><Badge tone={a.ok ? "primary" : "warn"}>{a.pct} %</Badge></div>;
          })}
        </div>
      )}

      <Field label="Observaciones (lugar, compañía, apetito, bebidas, ¿fue un día habitual?)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
      {msg?.error && <Alert tone="danger">{msg.error}</Alert>}
      {msg?.ok && <Alert tone="primary">{msg.ok}</Alert>}
      <div>
        <Button disabled={pending || !items.length} onClick={() => start(async () => {
          const res = await save({ recall_date: date, items, notes });
          setMsg(res);
          if (res.ok) { setItems([]); setNotes(""); }
        })}>{pending ? "Guardando…" : "Guardar recordatorio"}</Button>
      </div>
    </div>
  );
}
