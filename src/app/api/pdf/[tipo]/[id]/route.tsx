import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { Box, Frame, H2, P, Table, type Clinic } from "@/lib/pdf/documents";
import { createClient, getSession } from "@/lib/supabase/server";
import { ageFromBirthDate, evaluationLabels } from "@/lib/nutrition";
import type { MealPlan } from "@/lib/data";

export const runtime = "nodejs";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const fmt = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: /^\d{4}-\d{2}-\d{2}$/.test(d) ? "UTC" : "America/Mexico_City" }).format(new Date(d)) : "—";

async function clinicInfo(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Clinic> {
  const { data } = await supabase.from("clinic_settings").select("*").eq("id", 1).single();
  let logo: string | null = null;
  if (data?.logo_path) {
    const { data: file } = await supabase.storage.from("clinic").download(data.logo_path);
    if (file) logo = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  }
  return { ...(data ?? { name: "Consultorio", nutritionist_name: null, license: null, address: null, phone: null, email: null }), logo };
}

export async function GET(_: Request, { params }: { params: Promise<{ tipo: string; id: string }> }) {
  const { tipo, id } = await params;
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });
  const supabase = await createClient();
  const clinic = await clinicInfo(supabase);
  let doc: React.ReactElement<DocumentProps>;
  let filename: string;

  if (tipo === "plan") {
    // RLS: el paciente solo obtiene su plan activo
    const { data: plan } = await supabase.from("meal_plans").select("*, patients(full_name)").eq("id", id).maybeSingle();
    if (!plan) return new NextResponse("No encontrado", { status: 404 });
    const p = plan as MealPlan & { patients: { full_name: string } | null };
    // El paciente ya no lee la tabla de pacientes: su nombre sale de su sesión
    const patientName = p.patients?.full_name ?? session.fullName ?? "Paciente";
    const [{ data: groups }, { data: recipes }, { data: foods }] = await Promise.all([
      supabase.from("equivalent_groups").select("*").order("sort"),
      supabase.from("recipes").select("id, name"),
      supabase.from("foods").select("name, portion, group_code").eq("is_base", true).order("name"),
    ]);
    const gl = (code: string) => { const g = groups?.find((x) => x.code === code); return g ? (g.subgroup ? `${g.name} (${g.subgroup})` : g.name) : code; };
    const rname = Object.fromEntries((recipes ?? []).map((r) => [r.id, r.name]));
    const used = (groups ?? []).filter((g) => p.meals.some((m) => (m.equivalents[g.code] ?? 0) > 0));
    filename = `plan-${patientName.replace(/\W+/g, "-")}.pdf`;
    doc = (
      <Frame clinic={clinic} title={p.name} subtitle={`${patientName} · Inicio: ${fmt(p.start_date)}`}>
        <Box><P>Energía: {p.kcal_target} kcal/día · Proteína {Math.round(p.macros.protein_g)} g · Lípidos {Math.round(p.macros.fat_g)} g · Hidratos {Math.round(p.macros.carbs_g)} g</P></Box>
        <H2>Equivalentes por tiempo de comida</H2>
        <Table head={["Grupo", ...p.meals.map((m) => m.name)]} widths={[2.2, ...p.meals.map(() => 1)]}
          rows={used.map((g) => [gl(g.code), ...p.meals.map((m) => m.equivalents[g.code] || "")])} />
        {p.menu.length > 0 && <>
          <H2>Menú sugerido</H2>
          {DAYS.map((d, i) => {
            const items = p.menu.filter((x) => x.day === i + 1).sort((a, b) => a.meal - b.meal);
            return items.length ? <P key={d}>{d}: {items.map((x) => `${p.meals[x.meal]?.name}: ${[x.recipe_id ? rname[x.recipe_id] : "", x.text].filter(Boolean).join(" ")}`).join(" · ")}</P> : null;
          })}
        </>}
        {p.recommendations && <><H2>Recomendaciones</H2><P>{p.recommendations}</P></>}
        <H2>Lista de equivalentes (1 porción)</H2>
        {used.map((g) => (
          <P key={g.code}><P>{gl(g.code)}: </P>{(foods ?? []).filter((f) => f.group_code === g.code).slice(0, 12).map((f) => `${f.name} ${f.portion}`).join(" · ")}</P>
        ))}
      </Frame>
    );
  } else if (tipo === "expediente") {
    if (session.role !== "nutriologo") return new NextResponse("No autorizado", { status: 403 });
    const [{ data: pt }, { data: cons }, { data: anth }] = await Promise.all([
      supabase.from("patients").select("*").eq("id", id).single(),
      supabase.from("consultations").select("*, pes_diagnoses(*), consultation_addenda(*)").eq("patient_id", id).order("consulted_at"),
      supabase.from("anthropometry").select("*").eq("patient_id", id).order("measured_at"),
    ]);
    if (!pt) return new NextResponse("No encontrado", { status: 404 });
    filename = `expediente-${pt.full_name.replace(/\W+/g, "-")}.pdf`;
    doc = (
      <Frame clinic={clinic} title="Expediente clínico-nutricional" subtitle={`${pt.full_name} · ${pt.birth_date ? `${ageFromBirthDate(pt.birth_date)} años` : ""} · ${pt.sex ?? ""}`}>
        <H2>Historia clínica</H2>
        <P>Objetivo: {pt.goal ?? "—"}</P>
        <P>Patologías: {pt.pathologies.join(", ") || "—"} · Alergias: {pt.allergies.join(", ") || "—"}</P>
        <P>Medicamentos: {pt.medications ?? "—"}</P>
        <P>APP: {pt.personal_history ?? "—"}</P>
        <P>AHF: {pt.family_history ?? "—"}</P>
        <P>Historia dietética: {pt.diet_history ?? "—"}</P>
        {(anth ?? []).length > 0 && <>
          <H2>Antropometría</H2>
          <Table head={["Fecha", "Peso", "Talla", "IMC", "% grasa", "Cintura"]}
            rows={(anth ?? []).map((a) => [fmt(a.measured_at), a.weight_kg ?? "", a.height_cm ?? "", String(a.results?.imc?.value ?? ""), String(a.results?.grasa_pct?.value ?? ""), a.circumferences?.cintura ?? ""])} />
          <P muted>Última evaluación: {Object.entries(anth!.at(-1)!.results ?? {}).map(([k, v]) => `${evaluationLabels[k] ?? k} ${(v as { value: unknown }).value}`).join(" · ")}</P>
        </>}
        <H2>Notas de evolución (SOAP)</H2>
        {(cons ?? []).map((c) => (
          <Box key={c.id}>
            <P>{fmt(c.consulted_at)} · {c.status === "firmada" ? `Firmada ${fmt(c.signed_at)}` : "BORRADOR"} {c.reason ? `· ${c.reason}` : ""}</P>
            <P>S: {c.subjective ?? ""}</P><P>O: {c.objective ?? ""}</P><P>A: {c.assessment ?? ""}</P>
            {(c.pes_diagnoses as { problem: string; etiology: string; signs: string }[]).map((d, i) => <P key={i}>Dx PES: {d.problem} relacionado con {d.etiology}, evidenciado por {d.signs}.</P>)}
            <P>P: {c.plan ?? ""}</P>
            {(c.consultation_addenda as { body: string; created_at: string }[]).map((a, i) => <P key={i} muted>Adenda {fmt(a.created_at)}: {a.body}</P>)}
          </Box>
        ))}
      </Frame>
    );
  } else if (tipo === "recibo") {
    if (session.role !== "nutriologo") return new NextResponse("No autorizado", { status: 403 });
    const { data: pay } = await supabase.from("payments").select("*, patients(full_name)").eq("id", id).maybeSingle();
    if (!pay) return new NextResponse("No encontrado", { status: 404 });
    const name = (pay.patients as { full_name: string } | null)?.full_name ?? "";
    const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(pay.amount));
    filename = `recibo-${String(pay.folio).padStart(5, "0")}.pdf`;
    doc = (
      <Frame clinic={clinic} title={`Recibo de pago · Folio ${String(pay.folio).padStart(5, "0")}`} subtitle={`Fecha: ${fmt(pay.paid_on)}`}>
        <Box><P>Recibí de: {name}</P></Box>
        <Table head={["Concepto", "Forma de pago", "Importe"]} widths={[3, 1.5, 1]}
          rows={[[pay.sessions ? `${pay.concept} (${pay.sessions} sesiones)` : pay.concept, pay.method, money]]} />
        <H2>Total: {money}</H2>
        <P muted>Este recibo es un comprobante de pago del consultorio y no sustituye a una factura fiscal (CFDI).</P>
      </Frame>
    );
  } else {
    return new NextResponse("Tipo no válido", { status: 400 });
  }

  const buf = await renderToBuffer(doc);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${filename}"`, "cache-control": "private, no-store" },
  });
}
