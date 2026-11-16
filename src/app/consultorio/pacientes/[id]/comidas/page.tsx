import { ActionForm, SubmitButton } from "@/components/form";
import { Card, Empty, fmtDateTime, Textarea } from "@/components/ui";
import { commentMealPhoto } from "@/lib/actions/meals";
import { createClient } from "@/lib/supabase/server";

export default async function PatientMeals({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: photos } = await supabase.from("meal_photos").select("id, meal, note, eaten_at, comment").eq("patient_id", id).order("eaten_at", { ascending: false }).limit(60);

  return (
    <Card title="Fotos de comida">
      {photos?.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-2xl border border-border">
              <a href={`/api/meal-photo/${p.id}`} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado de corta duración, no optimizable */}
                <img src={`/api/meal-photo/${p.id}`} alt={`${p.meal}${p.note ? `: ${p.note}` : ""}`} loading="lazy" className="aspect-[4/3] w-full bg-surface-2 object-cover" />
              </a>
              <div className="p-3">
                <p className="font-semibold">{p.meal} <span className="text-xs font-normal text-muted">{fmtDateTime(p.eaten_at)}</span></p>
                {p.note && <p className="mt-1 text-sm text-muted">“{p.note}”</p>}
                <ActionForm action={commentMealPhoto.bind(null, id, p.id)} className="mt-2 grid gap-2">
                  <Textarea name="comment" rows={2} maxLength={1000} defaultValue={p.comment ?? ""} placeholder="Comentario para el paciente…" className="min-h-0" aria-label="Comentario para el paciente" />
                  <div><SubmitButton size="sm" variant="secondary">{p.comment ? "Actualizar" : "Comentar"}</SubmitButton></div>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty>El paciente aún no ha subido fotos de sus comidas.</Empty>}
    </Card>
  );
}
