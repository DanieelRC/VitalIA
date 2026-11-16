import { ActionForm, SubmitButton } from "@/components/form";
import type { Recipe } from "@/components/recipes";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { MEAL_TIMES, RECIPE_TAGS, getGroups, groupLabel } from "@/lib/data";
import { saveRecipe } from "../catalog-actions";

export async function RecipeForm({ r }: { r?: Recipe }) {
  const groups = await getGroups();
  return (
    <Card>
      <ActionForm action={saveRecipe.bind(null, r?.id ?? null)} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Nombre" className="sm:col-span-2"><Input name="name" defaultValue={r?.name} required /></Field>
          <Field label="Tiempo de comida">
            <Select name="meal_time" defaultValue={r?.meal_time ?? "comida"}>{Object.entries(MEAL_TIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Porciones"><Input name="servings" type="number" min={1} defaultValue={r?.servings ?? 1} /></Field>
            <Field label="Minutos"><Input name="prep_minutes" type="number" min={0} defaultValue={r?.prep_minutes ?? ""} /></Field>
          </div>
          <Field label="Descripción" className="sm:col-span-4"><Input name="description" defaultValue={r?.description ?? ""} /></Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Indicada para</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {Object.entries(RECIPE_TAGS).map(([k, v]) => (
              <label key={k} className="flex items-center gap-1"><input type="checkbox" name="tags" value={k} defaultChecked={r?.tags.includes(k)} /> {v}</label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ingredientes" hint="Uno por línea: cantidad unidad ingrediente (ej. «1/2 taza arroz»)">
            <Textarea name="ingredients" rows={8} defaultValue={r?.ingredients.map((i) => [i.quantity, i.unit, i.name].filter(Boolean).join(" ")).join("\n")} />
          </Field>
          <Field label="Modo de preparación" hint="Un paso por línea">
            <Textarea name="steps" rows={8} defaultValue={r?.steps.join("\n")} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Equivalentes por porción (calculan energía y macros)</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {groups.filter((g) => g.code !== "libres").map((g) => (
              <Field key={g.code} label={groupLabel(g)}>
                <Input name={`eq_${g.code}`} type="number" min={0} step={0.25} defaultValue={r?.equivalents[g.code] ?? ""} />
              </Field>
            ))}
          </div>
        </fieldset>
        <div><SubmitButton>Guardar receta</SubmitButton></div>
      </ActionForm>
    </Card>
  );
}
