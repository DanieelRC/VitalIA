"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import type { Routine } from "@/components/routine-view";
import { saveRoutine, type RoutineItem } from "../../../catalog-actions";

export function RoutineBuilder({ id, initial, exercises }: { id: string | null; initial: Routine | null; exercises: { id: string; name: string; type: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [meta, setMeta] = useState({
    name: initial?.name ?? "", type: (initial?.type ?? "anaerobico") as "aerobico" | "anaerobico" | "mixto",
    level: initial?.level ?? "principiante", goal: initial?.goal ?? "", notes: initial?.notes ?? "",
  });
  const [items, setItems] = useState<RoutineItem[]>(initial?.items ?? []);
  const [pick, setPick] = useState("");

  const upd = (i: number, patch: Partial<RoutineItem>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setItems((l) => {
    const c = [...l]; const j = i + d; if (j < 0 || j >= c.length) return c; [c[i], c[j]] = [c[j], c[i]]; return c;
  });
  const numOrUndef = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <div className="grid gap-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Nombre" className="sm:col-span-2"><Input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></Field>
          <Field label="Tipo">
            <Select value={meta.type} onChange={(e) => setMeta({ ...meta, type: e.target.value as typeof meta.type })}>
              <option value="aerobico">Aeróbica</option><option value="anaerobico">Anaeróbica / fuerza</option><option value="mixto">Mixta</option>
            </Select>
          </Field>
          <Field label="Nivel">
            <Select value={meta.level} onChange={(e) => setMeta({ ...meta, level: e.target.value })}>
              <option value="principiante">Principiante</option><option value="intermedio">Intermedio</option><option value="avanzado">Avanzado</option>
            </Select>
          </Field>
          <Field label="Objetivo" className="sm:col-span-4"><Input value={meta.goal} onChange={(e) => setMeta({ ...meta, goal: e.target.value })} /></Field>
          <Field label="Indicaciones generales (calentamiento, progresión, RPE)" className="sm:col-span-4">
            <Textarea value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} rows={2} />
          </Field>
        </div>
      </Card>
      <Card title="Ejercicios">
        <div className="mb-3 flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="max-w-sm">
            <option value="">Agregar ejercicio…</option>
            {exercises.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.type})</option>)}
          </Select>
          <Button variant="secondary" disabled={!pick} onClick={() => {
            const e = exercises.find((x) => x.id === pick)!;
            setItems((l) => [...l, e.type === "aerobico" ? { exercise_id: e.id, name: e.name, duration_min: 20, intensity: "Moderada" } : { exercise_id: e.id, name: e.name, sets: 3, reps: "12", rest_s: 60 }]);
            setPick("");
          }}>Agregar</Button>
        </div>
        <div className="flex flex-col gap-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-2 sm:grid-cols-[1fr_70px_90px_90px_90px_1fr_auto] sm:items-end">
              <Field label="Ejercicio" className="col-span-2 sm:col-span-1"><Input value={it.name} onChange={(e) => upd(i, { name: e.target.value })} /></Field>
              <Field label="Series"><Input inputMode="numeric" value={it.sets ?? ""} onChange={(e) => upd(i, { sets: numOrUndef(e.target.value) })} /></Field>
              <Field label="Reps"><Input value={it.reps ?? ""} onChange={(e) => upd(i, { reps: e.target.value || undefined })} /></Field>
              <Field label="Desc. (s)"><Input inputMode="numeric" value={it.rest_s ?? ""} onChange={(e) => upd(i, { rest_s: numOrUndef(e.target.value) })} /></Field>
              <Field label="Min"><Input inputMode="numeric" value={it.duration_min ?? ""} onChange={(e) => upd(i, { duration_min: numOrUndef(e.target.value) })} /></Field>
              <Field label="Intensidad"><Input value={it.intensity ?? ""} onChange={(e) => upd(i, { intensity: e.target.value || undefined })} placeholder="RPE 7 / 70% FCmáx" /></Field>
              <div className="flex gap-1">
                <button className="rounded p-2 hover:bg-surface" aria-label="Subir" onClick={() => move(i, -1)}><ArrowUp className="size-4" /></button>
                <button className="rounded p-2 hover:bg-surface" aria-label="Bajar" onClick={() => move(i, 1)}><ArrowDown className="size-4" /></button>
                <button className="rounded p-2 text-danger hover:bg-surface" aria-label="Quitar" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      {msg?.error && <Alert tone="danger">{msg.error}</Alert>}
      {msg?.ok && <Alert tone="primary">{msg.ok}</Alert>}
      <div>
        <Button disabled={pending} onClick={() => start(async () => {
          const res = await saveRoutine(id, { ...meta, items });
          setMsg(res);
          if ("id" in res && res.id && !id) router.replace(`/consultorio/ejercicios/rutinas/${res.id}`);
        })}>{pending ? "Guardando…" : "Guardar rutina"}</Button>
      </div>
    </div>
  );
}
