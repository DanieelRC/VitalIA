import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { Card, Empty, Field, fmtDateTime, Input, PageHeader, Select } from "@/components/ui";
import { deleteMealPhoto, uploadMealPhoto } from "@/lib/actions/meals";
import type { MealPlan } from "@/lib/data";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Mis comidas" };

const DEFAULT_MEALS = ["Desayuno", "Colación", "Comida", "Cena"];

export default async function MealsPage() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  const [{ data: photos }, { data: plan }] = await Promise.all([
    supabase.from("meal_photos").select("id, meal, note, eaten_at, comment, commented_at").eq("patient_id", s.patientId!).order("eaten_at", { ascending: false }).limit(60),
    supabase.from("meal_plans").select("meals").eq("patient_id", s.patientId!).eq("status", "activo").maybeSingle(),
  ]);
  const meals = ((plan?.meals ?? []) as MealPlan["meals"]).map((m) => m.name);

  return (
    <>
      <PageHeader title="Mis comidas" subtitle="Toma una foto de tu plato. Tu nutriólogo la verá y te dejará comentarios; aquí nadie te califica." />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr] lg:items-start">
        <Card title="Nueva foto">
          <ActionForm action={uploadMealPhoto} resetOnOk className="grid gap-3">
            <Field label="Foto"><Input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" required className="h-auto py-2" /></Field>
            <Field label="¿Qué comida fue?"><Select name="meal">{(meals.length ? meals : DEFAULT_MEALS).map((m) => <option key={m}>{m}</option>)}</Select></Field>
            <Field label="Nota (opcional)" hint="Qué era, cómo te cayó, dónde comiste"><Input name="note" maxLength={500} /></Field>
            <div><SubmitButton pendingText="Subiendo…">Guardar foto</SubmitButton></div>
          </ActionForm>
        </Card>

        {photos?.length ? (
          <ul className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
                {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado de corta duración, no optimizable */}
                <img src={`/api/meal-photo/${p.id}`} alt={`${p.meal}${p.note ? `: ${p.note}` : ""}`} loading="lazy" className="aspect-[4/3] w-full bg-surface-2 object-cover" />
                <div className="p-4">
                  <p className="font-display font-bold">{p.meal}</p>
                  <p className="text-xs text-muted">{fmtDateTime(p.eaten_at)}</p>
                  {p.note && <p className="mt-2 text-sm">{p.note}</p>}
                  {p.comment
                    ? <p className="mt-3 rounded-xl bg-primary-soft px-3 py-2 text-sm"><span className="font-semibold text-primary">Tu nutriólogo: </span>{p.comment}</p>
                    : <p className="mt-3 text-xs text-muted">Aún sin comentario.</p>}
                  <form action={deleteMealPhoto.bind(null, p.id)} className="mt-2"><ConfirmButton message="¿Eliminar esta foto?">Eliminar</ConfirmButton></form>
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty>Todavía no has subido fotos. Empieza con tu próxima comida.</Empty>}
      </div>
    </>
  );
}
