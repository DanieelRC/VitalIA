"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { Alert, Button, Card, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { evaluateFormula, FORMULA_VARS, macroPresets, mealDistributionPresets, validateFormula, type Group, type MacroState } from "@/lib/nutrition";
import { FAMILY_LABEL, FAMILY_ORDER, familyColor, groupFamily } from "@/lib/groups";
import { MacroStudio, NumField } from "@/components/studio/macro-studio";
import {
  createGroup, deleteConfig, deleteGroup, resetGroup, saveFactor, saveField, saveFormula, saveGroupValues, saveMacroPreset, saveMealPreset,
  savePdfBranding, saveSoapTemplate,
} from "./actions";

type Res = { ok: true } | { error: string };
export type PersonalizerData = {
  macroPresets: { id: string; name: string; protein_pct: number; fat_pct: number; carbs_pct: number; note: string | null }[];
  mealPresets: { id: string; name: string; meals: { name: string; kcal_pct: number }[] }[];
  formulas: { id: string; name: string; expression: string; note: string | null }[];
  factors: { id: string; kind: "actividad" | "estres"; label: string; value: number }[];
  fields: { id: string; key: string; label: string; kind: string; options: string[] }[];
  soap: { id: string; name: string; reason: string | null; subjective: string | null; objective: string | null; assessment: string | null; plan: string | null }[];
  groups: (Group & { is_custom: boolean; base_values: { kcal: number; protein_g: number; fat_g: number; carbs_g: number } | null })[];
  pdf: { pdf_accent: string; pdf_footer: string | null; pdf_sections: Record<string, boolean>; name: string };
};

const SECTIONS = [
  { key: "distribuciones", label: "Distribuciones y tiempos" }, { key: "formulas", label: "Fórmulas y factores" },
  { key: "equivalentes", label: "Equivalentes" }, { key: "expediente", label: "Expediente" }, { key: "documentos", label: "Documentos" },
] as const;
const SAMPLE = { peso: 70, talla: 165, edad: 30, mlg: 50, hombre: 0, mujer: 1 };
const KIND_LABEL: Record<string, string> = { texto: "Texto", numero: "Número", si_no: "Sí / No", lista: "Lista de opciones" };

export function Personalizer({ data }: { data: PersonalizerData }) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof SECTIONS)[number]["key"]>("distribuciones");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "danger" | "primary"; text: string } | null>(null);
  const run = (fn: () => Promise<Res>, ok = "Guardado.", after?: () => void) => start(async () => {
    const r = await fn();
    if ("error" in r) setMsg({ tone: "danger", text: r.error });
    else { setMsg({ tone: "primary", text: ok }); after?.(); router.refresh(); }
  });
  const Del = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <button type="button" disabled={pending} aria-label={label} title={label} onClick={() => { if (window.confirm(`¿${label}?`)) onClick(); }}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="size-4" /></button>
  );

  return (
    <div>
      <nav className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="Secciones">
        {SECTIONS.map((s) => (
          <button key={s.key} type="button" onClick={() => { setTab(s.key); setMsg(null); }} aria-current={tab === s.key ? "page" : undefined}
            className={cn("whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors", tab === s.key ? "bg-text font-semibold text-bg" : "text-muted hover:bg-surface-2 hover:text-text")}>{s.label}</button>
        ))}
      </nav>
      {msg && <div className="mb-4" role="status"><Alert tone={msg.tone}>{msg.text}</Alert></div>}

      {tab === "distribuciones" && <Distributions data={data} run={run} Del={Del} />}
      {tab === "formulas" && <Formulas data={data} run={run} Del={Del} pending={pending} />}
      {tab === "equivalentes" && <Groups data={data} run={run} Del={Del} pending={pending} />}
      {tab === "expediente" && <Record data={data} run={run} Del={Del} pending={pending} />}
      {tab === "documentos" && <Documents data={data} run={run} pending={pending} />}
    </div>
  );
}

type Run = (fn: () => Promise<Res>, ok?: string, after?: () => void) => void;
type DelC = (p: { onClick: () => void; label: string }) => ReactNode;
const Row = ({ children }: { children: ReactNode }) => <li className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">{children}</li>;
const None = ({ children }: { children: ReactNode }) => <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted">{children}</p>;

// ---------------- Distribuciones ----------------
function Distributions({ data, run, Del }: { data: PersonalizerData; run: Run; Del: DelC }) {
  const [ms, setMs] = useState<MacroState>({ pct: { protein: 20, fat: 30, carbs: 50 }, locks: { protein: null, fat: null, carbs: null } });
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [meals, setMeals] = useState(mealDistributionPresets[2].meals.map((m) => ({ ...m })));
  const [mealName, setMealName] = useState("");
  const sum = Math.round(meals.reduce((a, m) => a + m.kcal_pct, 0) * 10) / 10;
  const balanced = Math.abs(ms.pct.protein + ms.pct.fat + ms.pct.carbs - 100) < 0.05;

  return (
    <div className="grid gap-4">
      <Card title="Mis distribuciones de macronutrientes">
        <p className="mb-3 text-sm text-muted">Aparecen en el estudio de distribución de cada plan, antes de las distribuciones tipo ({macroPresets.length}).</p>
        {data.macroPresets.length ? (
          <ul className="mb-5 grid gap-2 sm:grid-cols-2">
            {data.macroPresets.map((p) => (
              <Row key={p.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <div className="mt-1 flex h-2 overflow-hidden rounded-full">
                    <span style={{ width: `${p.protein_pct}%`, background: "var(--g-aoa)" }} /><span style={{ width: `${p.fat_pct}%`, background: "var(--g-grasas)" }} /><span style={{ width: `${p.carbs_pct}%`, background: "var(--g-cereales)" }} />
                  </div>
                  <p className="tabular mt-1 text-xs text-muted">P {p.protein_pct} % · L {p.fat_pct} % · HC {p.carbs_pct} %{p.note ? ` · ${p.note}` : ""}</p>
                </div>
                <Del label={`Eliminar ${p.name}`} onClick={() => run(() => deleteConfig("macro_presets", p.id), "Eliminada.")} />
              </Row>
            ))}
          </ul>
        ) : <div className="mb-5"><None>Aún no guardas distribuciones propias.</None></div>}
        <h3 className="mb-2 font-display text-base font-bold">Nueva distribución</h3>
        <MacroStudio kcal={2000} weightKg={70} value={ms} onChange={setMs} />
        <p className="mt-1 text-xs text-muted">Los gramos y g/kg de arriba son un ejemplo con 2000 kcal y 70 kg; lo que se guarda son los porcentajes.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ej. Hipertrofia" /></Field>
          <Field label="Nota (opcional)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Cuándo usarla, precauciones…" /></Field>
          <Button disabled={!name.trim() || !balanced} onClick={() => run(() => saveMacroPreset({ name, note, protein_pct: ms.pct.protein, fat_pct: ms.pct.fat, carbs_pct: ms.pct.carbs }), "Distribución guardada.", () => { setName(""); setNote(""); })}>Guardar</Button>
        </div>
      </Card>

      <Card title="Mis tiempos de comida">
        {data.mealPresets.length ? (
          <ul className="mb-5 grid gap-2 sm:grid-cols-2">
            {data.mealPresets.map((p) => (
              <Row key={p.id}>
                <div className="min-w-0 flex-1"><p className="font-medium">{p.name}</p><p className="text-xs text-muted">{p.meals.map((m) => `${m.name} ${m.kcal_pct} %`).join(" · ")}</p></div>
                <Del label={`Eliminar ${p.name}`} onClick={() => run(() => deleteConfig("meal_presets", p.id), "Eliminada.")} />
              </Row>
            ))}
          </ul>
        ) : <div className="mb-5"><None>Aún no guardas distribuciones de tiempos.</None></div>}
        <h3 className="mb-2 font-display text-base font-bold">Nueva distribución de tiempos</h3>
        <ul className="grid gap-2">
          {meals.map((m, i) => (
            <li key={i} className="grid grid-cols-[1fr_96px_auto] items-center gap-2">
              <Input aria-label={`Nombre del tiempo ${i + 1}`} value={m.name} maxLength={60} onChange={(e) => setMeals((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <NumField label={`Porcentaje de ${m.name}`} value={m.kcal_pct} step={5} max={100} suffix="%" className="[&_input]:h-10" onCommit={(v) => setMeals((l) => l.map((x, j) => (j === i ? { ...x, kcal_pct: v } : x)))} />
              <button type="button" aria-label={`Quitar ${m.name}`} disabled={meals.length <= 1} onClick={() => setMeals((l) => l.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Button size="sm" variant="secondary" disabled={meals.length >= 8} onClick={() => setMeals((l) => [...l, { name: "Colación", kcal_pct: 0 }])}>Agregar tiempo</Button>
          <span className={cn("tabular rounded-full px-2.5 py-1 text-xs font-semibold", sum === 100 ? "bg-primary-soft text-primary" : "bg-warn-soft text-warn")}>Suma {sum} %</span>
          <Field label="Nombre" className="ml-auto min-w-48"><Input value={mealName} onChange={(e) => setMealName(e.target.value)} maxLength={80} placeholder="Ej. 5 tiempos con cena ligera" /></Field>
          <Button disabled={!mealName.trim() || sum !== 100} onClick={() => run(() => saveMealPreset({ name: mealName, meals }), "Tiempos guardados.", () => setMealName(""))}>Guardar</Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------- Fórmulas y factores ----------------
function Formulas({ data, run, Del, pending }: { data: PersonalizerData; run: Run; Del: DelC; pending: boolean }) {
  const [name, setName] = useState("");
  const [expr, setExpr] = useState("");
  const [note, setNote] = useState("");
  const [factor, setFactor] = useState({ kind: "actividad" as "actividad" | "estres", label: "", value: 1.4 });
  const bad = expr.trim() ? validateFormula(expr) : null;
  let preview: number | null = null;
  if (expr.trim() && !bad) { try { preview = Math.round(evaluateFormula(expr, SAMPLE)); } catch { preview = null; } }
  const evalOf = (e: string) => { try { return Math.round(evaluateFormula(e, SAMPLE)); } catch { return null; } };

  return (
    <div className="grid gap-4">
      <Card title="Mis fórmulas de gasto energético basal">
        <p className="mb-3 text-sm text-muted">Se comparan junto a las fórmulas clásicas en cada plan y en la calculadora, y el asistente también las usa.</p>
        {data.formulas.length ? (
          <ul className="mb-5 grid gap-2">
            {data.formulas.map((f) => (
              <Row key={f.id}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{f.name}</p>
                  <p className="formula formula-block mt-1 break-words text-sm">GEB = {f.expression}</p>
                  {f.note && <p className="mt-1 text-xs text-muted">{f.note}</p>}
                </div>
                <span className="tabular shrink-0 text-right text-xs text-muted">Ejemplo<br /><b className="text-sm text-text">{evalOf(f.expression) ?? "—"} kcal</b></span>
                <Del label={`Eliminar ${f.name}`} onClick={() => run(() => deleteConfig("custom_formulas", f.id), "Eliminada.")} />
              </Row>
            ))}
          </ul>
        ) : <div className="mb-5"><None>Aún no tienes fórmulas propias.</None></div>}

        <h3 className="mb-2 font-display text-base font-bold">Nueva fórmula</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ej. Mifflin con MLG" /></Field>
          <Field label="Nota (opcional)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Población, fuente…" /></Field>
          <Field label="GEB =" className="sm:col-span-2" hint="Operadores: + − × ÷ ^ y paréntesis. Funciones: min, max, abs, raiz, ln, log, redondear.">
            <Input value={expr} onChange={(e) => setExpr(e.target.value)} maxLength={300} placeholder="10*peso + 6.25*talla - 5*edad + 5*hombre - 161*mujer" className="formula !text-base" spellCheck={false} autoCapitalize="off" />
          </Field>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(FORMULA_VARS).map(([vname, vlabel]) => (
            <button key={vname} type="button" title={vlabel} onClick={() => setExpr((e) => `${e}${e && !/[\s(*+\-/^]$/.test(e) ? " " : ""}${vname}`)} className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-primary-soft/50">
              <span className="formula font-semibold">{vname}</span> <span className="text-muted">{vlabel}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {bad ? <p className="text-sm text-danger" role="alert">{bad}</p>
            : preview != null ? <p className="text-sm text-muted">Ejemplo (mujer, 70 kg, 165 cm, 30 años, MLG 50 kg): <b className="tabular text-text">{preview} kcal</b></p>
              : <p className="text-sm text-muted">Escribe la fórmula para ver un ejemplo.</p>}
          <Button className="ml-auto" disabled={pending || !name.trim() || !expr.trim() || !!bad} onClick={() => run(() => saveFormula({ name, expression: expr, note }), "Fórmula guardada.", () => { setName(""); setExpr(""); setNote(""); })}>Guardar fórmula</Button>
        </div>
      </Card>

      <Card title="Mis factores de actividad y de estrés">
        <div className="grid gap-4 sm:grid-cols-2">
          {(["actividad", "estres"] as const).map((k) => (
            <div key={k}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{k === "actividad" ? "Actividad física" : "Estrés fisiológico"}</p>
              {data.factors.filter((f) => f.kind === k).length ? (
                <ul className="grid gap-1.5">
                  {data.factors.filter((f) => f.kind === k).map((f) => (
                    <Row key={f.id}><span className="flex-1 text-sm">{f.label}</span><b className="tabular">{Number(f.value)}</b><Del label={`Eliminar ${f.label}`} onClick={() => run(() => deleteConfig("custom_factors", f.id), "Eliminado.")} /></Row>
                  ))}
                </ul>
              ) : <None>Sin factores propios.</None>}
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_110px_auto] sm:items-end">
          <Field label="Tipo"><Select value={factor.kind} onChange={(e) => setFactor({ ...factor, kind: e.target.value as "actividad" | "estres" })}><option value="actividad">Actividad</option><option value="estres">Estrés</option></Select></Field>
          <Field label="Nombre"><Input value={factor.label} maxLength={80} onChange={(e) => setFactor({ ...factor, label: e.target.value })} placeholder="Ej. Crossfit 5 días" /></Field>
          <Field label="Factor"><NumField label="Valor del factor" value={factor.value} step={0.05} min={0.5} max={3} className="[&_input]:h-10" onCommit={(v) => setFactor({ ...factor, value: v })} /></Field>
          <Button disabled={pending || !factor.label.trim()} onClick={() => run(() => saveFactor(factor), "Factor guardado.", () => setFactor({ ...factor, label: "" }))}>Agregar</Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------- Equivalentes ----------------
function Groups({ data, run, Del, pending }: { data: PersonalizerData; run: Run; Del: DelC; pending: boolean }) {
  const [draft, setDraft] = useState<Record<string, { kcal: number; protein_g: number; fat_g: number; carbs_g: number }>>({});
  const [g, setG] = useState({ family: "cereales", name: "", subgroup: "", kcal: 70, protein_g: 2, fat_g: 0, carbs_g: 15 });
  const vals = (x: PersonalizerData["groups"][number]) => draft[x.code] ?? { kcal: Number(x.kcal), protein_g: Number(x.protein_g), fat_g: Number(x.fat_g), carbs_g: Number(x.carbs_g) };
  const cols = [["kcal", "kcal"], ["protein_g", "P g"], ["fat_g", "L g"], ["carbs_g", "HC g"]] as const;

  return (
    <div className="grid gap-4">
      <Card title="Aporte por equivalente">
        <p className="mb-3 text-sm text-muted">Ajusta el aporte promedio de cada grupo a tu criterio (por ejemplo, otra edición del SMAE). Afecta los cálculos de todos los planes; el aporte original se puede restablecer.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-2">Grupo</th>{cols.map(([, l]) => <th key={l} className="w-24 px-1 py-2">{l}</th>)}<th className="w-40" /></tr></thead>
            <tbody>
              {data.groups.map((x) => {
                const v = vals(x), b = x.base_values;
                const dirty = !!draft[x.code];
                const changed = !!b && (Number(x.kcal) !== Number(b.kcal) || Number(x.protein_g) !== Number(b.protein_g) || Number(x.fat_g) !== Number(b.fat_g) || Number(x.carbs_g) !== Number(b.carbs_g));
                return (
                  <tr key={x.code} className="border-t border-border">
                    <td className="py-1.5 pl-3" style={{ boxShadow: `inset 4px 0 0 ${familyColor(groupFamily(x.code))}` }}>
                      <span className="font-medium">{x.name}</span>{x.subgroup && <span className="text-xs text-muted"> · {x.subgroup}</span>}
                      {x.is_custom && <span className="ml-1.5 rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-info">propio</span>}
                      {changed && !x.is_custom && <span className="ml-1.5 rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn">ajustado</span>}
                    </td>
                    {cols.map(([k, l]) => <td key={k} className="px-1 py-1.5"><NumField label={`${x.name} ${l}`} value={v[k]} step={k === "kcal" ? 5 : 0.5} max={k === "kcal" ? 1000 : 200} onCommit={(n) => setDraft((d) => ({ ...d, [x.code]: { ...v, [k]: n } }))} /></td>)}
                    <td className="py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        {dirty && <Button size="sm" disabled={pending} onClick={() => run(() => saveGroupValues(x.code, v), "Aporte actualizado.", () => setDraft((d) => { const n = { ...d }; delete n[x.code]; return n; }))}>Guardar</Button>}
                        {changed && !dirty && !x.is_custom && <button type="button" title="Restablecer el aporte original" aria-label={`Restablecer ${x.name}`} disabled={pending} onClick={() => run(() => resetGroup(x.code), "Aporte restablecido.")} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"><RotateCcw className="size-4" /></button>}
                        {x.is_custom && <Del label={`Eliminar el grupo ${x.name}`} onClick={() => run(() => deleteGroup(x.code), "Grupo eliminado.")} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Nuevo grupo de equivalentes">
        <p className="mb-3 text-sm text-muted">Para subgrupos que uses en consulta (por ejemplo, «Bebidas vegetales» o «Proteína en polvo»). La familia define su color en platos y tablas.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Familia">
            <Select value={g.family} onChange={(e) => setG({ ...g, family: e.target.value })}>{FAMILY_ORDER.filter((f) => f !== "libres").map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}</Select>
          </Field>
          <Field label="Nombre"><Input value={g.name} maxLength={80} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="Ej. Bebidas vegetales" /></Field>
          <Field label="Subgrupo (opcional)"><Input value={g.subgroup} maxLength={60} onChange={(e) => setG({ ...g, subgroup: e.target.value })} placeholder="Ej. sin azúcar" /></Field>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(4,110px)_1fr] sm:items-end">
          {cols.map(([k, l]) => <Field key={k} label={l}><NumField label={l} value={g[k]} step={k === "kcal" ? 5 : 0.5} max={k === "kcal" ? 1000 : 200} className="[&_input]:h-10" onCommit={(n) => setG({ ...g, [k]: n })} /></Field>)}
          <div className="col-span-2 flex justify-end sm:col-span-1"><Button disabled={pending || !g.name.trim()} onClick={() => run(() => createGroup(g), "Grupo creado.", () => setG({ ...g, name: "", subgroup: "" }))}>Crear grupo</Button></div>
        </div>
        <p className="tabular mt-2 text-xs text-muted">Energía por macronutrientes: {Math.round(g.protein_g * 4 + g.fat_g * 9 + g.carbs_g * 4)} kcal (declarada: {g.kcal} kcal).</p>
      </Card>
    </div>
  );
}

// ---------------- Expediente ----------------
function Record({ data, run, Del, pending }: { data: PersonalizerData; run: Run; Del: DelC; pending: boolean }) {
  const [f, setF] = useState({ label: "", kind: "texto" as "texto" | "numero" | "si_no" | "lista", options: "" });
  const empty = { name: "", reason: "", subjective: "", objective: "", assessment: "", plan: "" };
  const [t, setT] = useState(empty);
  return (
    <div className="grid gap-4">
      <Card title="Campos propios de la historia clínica">
        <p className="mb-3 text-sm text-muted">Aparecen en el formulario de cada paciente, en la sección «Campos del consultorio». Solo los ve el nutriólogo.</p>
        {data.fields.length ? (
          <ul className="mb-4 grid gap-2 sm:grid-cols-2">
            {data.fields.map((x) => (
              <Row key={x.id}><div className="min-w-0 flex-1"><p className="font-medium">{x.label}</p><p className="text-xs text-muted">{KIND_LABEL[x.kind]}{x.options.length ? `: ${x.options.join(", ")}` : ""}</p></div>
                <Del label={`Eliminar el campo ${x.label}`} onClick={() => run(() => deleteConfig("custom_fields", x.id), "Campo eliminado. Los datos ya capturados se conservan en cada expediente.")} /></Row>
            ))}
          </ul>
        ) : <div className="mb-4"><None>Sin campos propios.</None></div>}
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_1fr_auto] sm:items-end">
          <Field label="Nombre del campo"><Input value={f.label} maxLength={80} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Ej. Evacuaciones por semana" /></Field>
          <Field label="Tipo"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Opciones" hint={f.kind === "lista" ? "Separadas por coma" : "Solo para listas"}><Input value={f.options} disabled={f.kind !== "lista"} onChange={(e) => setF({ ...f, options: e.target.value })} placeholder="Bristol 1-2, Bristol 3-4, Bristol 5-7" /></Field>
          <Button disabled={pending || !f.label.trim()} onClick={() => run(() => saveField({ label: f.label, kind: f.kind, options: f.kind === "lista" ? f.options.split(",").map((s) => s.trim()).filter(Boolean) : [] }), "Campo agregado.", () => setF({ label: "", kind: "texto", options: "" }))}>Agregar</Button>
        </div>
      </Card>

      <Card title="Plantillas de nota SOAP">
        <p className="mb-3 text-sm text-muted">Texto base para tus consultas más frecuentes; se aplica con un toque en una nota en borrador y luego la ajustas.</p>
        {data.soap.length ? (
          <ul className="mb-4 grid gap-2 sm:grid-cols-2">
            {data.soap.map((x) => (
              <Row key={x.id}><div className="min-w-0 flex-1"><p className="font-medium">{x.name}</p><p className="truncate text-xs text-muted">{[x.reason, x.subjective, x.plan].filter(Boolean).join(" · ") || "Sin texto"}</p></div>
                <Del label={`Eliminar la plantilla ${x.name}`} onClick={() => run(() => deleteConfig("soap_templates", x.id), "Plantilla eliminada.")} /></Row>
            ))}
          </ul>
        ) : <div className="mb-4"><None>Sin plantillas.</None></div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre de la plantilla"><Input value={t.name} maxLength={80} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Ej. Seguimiento de control de peso" /></Field>
          <Field label="Motivo de consulta"><Input value={t.reason} onChange={(e) => setT({ ...t, reason: e.target.value })} /></Field>
          <Field label="S · Subjetivo"><Textarea rows={3} value={t.subjective} onChange={(e) => setT({ ...t, subjective: e.target.value })} /></Field>
          <Field label="O · Objetivo"><Textarea rows={3} value={t.objective} onChange={(e) => setT({ ...t, objective: e.target.value })} /></Field>
          <Field label="A · Análisis"><Textarea rows={3} value={t.assessment} onChange={(e) => setT({ ...t, assessment: e.target.value })} /></Field>
          <Field label="P · Plan"><Textarea rows={3} value={t.plan} onChange={(e) => setT({ ...t, plan: e.target.value })} /></Field>
        </div>
        <div className="mt-3 flex justify-end"><Button disabled={pending || !t.name.trim()} onClick={() => run(() => saveSoapTemplate(t), "Plantilla guardada.", () => setT(empty))}>Guardar plantilla</Button></div>
      </Card>
    </div>
  );
}

// ---------------- Documentos ----------------
const PDF_SECTIONS = [["equivalentes", "Equivalentes por tiempo de comida"], ["menu", "Menú semanal"], ["recomendaciones", "Recomendaciones"], ["intercambios", "Lista de intercambios"]] as const;
const ACCENTS = ["#177a47", "#0f3a28", "#24609f", "#b8321f", "#e97a26", "#7a4a8a", "#1b2420"];

function Documents({ data, run, pending }: { data: PersonalizerData; run: Run; pending: boolean }) {
  const [accent, setAccent] = useState(data.pdf.pdf_accent);
  const [footer, setFooter] = useState(data.pdf.pdf_footer ?? "");
  const [sections, setSections] = useState<Record<string, boolean>>({ equivalentes: true, menu: true, recomendaciones: true, intercambios: true, ...data.pdf.pdf_sections });
  return (
    <Card title="PDF del plan de alimentación">
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="grid h-fit gap-4">
          <Field label="Color de acento">
            <div className="flex flex-wrap items-center gap-2">
              {ACCENTS.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={accent === c} onClick={() => setAccent(c)} className={cn("size-8 rounded-full border-2 transition-transform", accent === c ? "scale-110 border-text" : "border-transparent")} style={{ background: c }} />)}
              <input type="color" aria-label="Otro color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-border bg-surface" />
              <span className="tabular text-xs text-muted">{accent}</span>
            </div>
          </Field>
          <Field label="Pie de página" hint="Se imprime en todas las hojas junto al número de página."><Input value={footer} maxLength={200} onChange={(e) => setFooter(e.target.value)} placeholder="Ej. Tu próxima cita es parte del tratamiento · Tel. 55 0000 0000" /></Field>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Secciones que se imprimen</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {PDF_SECTIONS.map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <input type="checkbox" checked={!!sections[k]} onChange={(e) => setSections({ ...sections, [k]: e.target.checked })} className="size-4 accent-[var(--primary)]" />{l}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-muted">El logotipo y los datos del consultorio se cambian en Ajustes.</p>
          <div><Button disabled={pending} onClick={() => run(() => savePdfBranding({ pdf_accent: accent, pdf_footer: footer, pdf_sections: sections }), "Documento actualizado. Descarga un plan en PDF para verlo.")}>Guardar</Button></div>
        </div>
        <div aria-hidden className="rounded-lg border border-border bg-white p-4 text-[9px] leading-snug text-[#1b2420] shadow-soft">
          <div className="border-b-2 pb-1.5" style={{ borderColor: accent }}><p className="text-sm font-bold" style={{ color: accent }}>{data.pdf.name}</p><p className="text-[#5f6b65]">Datos del consultorio</p></div>
          <p className="mt-2 text-[11px] font-bold">Plan de alimentación</p>
          <div className="mt-1 rounded bg-[#f0f2ee] p-1.5">Energía: 1800 kcal/día · P 90 g · L 60 g · HC 225 g</div>
          {PDF_SECTIONS.filter(([k]) => sections[k]).map(([k, l]) => (
            <div key={k}><p className="mt-2 font-bold" style={{ color: accent }}>{l}</p><div className="mt-1 space-y-1"><div className="h-1.5 rounded bg-[#e2e5df]" /><div className="h-1.5 w-4/5 rounded bg-[#e2e5df]" /></div></div>
          ))}
          <p className="mt-4 text-center text-[8px] text-[#5f6b65]">{footer || "Documento confidencial"} · 1/1</p>
        </div>
      </div>
    </Card>
  );
}
