import { Badge } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import { getPatient } from "@/lib/data";
import { ageFromBirthDate } from "@/lib/nutrition";

const tabs = [
  { href: "", label: "Resumen" },
  { href: "/preconsulta", label: "Pre-consulta" },
  { href: "/expediente", label: "Expediente SOAP" },
  { href: "/antropometria", label: "Antropometría" },
  { href: "/plan", label: "Plan alimenticio" },
  { href: "/r24h", label: "Recordatorio 24 h" },
  { href: "/comidas", label: "Comidas" },
  { href: "/laboratorios", label: "Laboratorios" },
  { href: "/indicaciones", label: "Suplementos y rutinas" },
  { href: "/anexos", label: "Anexos" },
  { href: "/progreso", label: "Progreso" },
  { href: "/pagos", label: "Pagos" },
];

export default async function PatientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPatient(id);
  return (
    <>
      <div className="mb-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{p.full_name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          {p.birth_date && <span>{ageFromBirthDate(p.birth_date)} años</span>}
          {p.sex && <span>· {p.sex === "F" ? "Femenino" : "Masculino"}</span>}
          {p.goal && <span>· {p.goal}</span>}
          {p.pathologies.map((x) => <Badge key={x} tone="info">{x}</Badge>)}
          {p.allergies.map((x) => <Badge key={x} tone="danger">Alergia: {x}</Badge>)}
          {!p.active && <Badge tone="warn">Inactivo</Badge>}
        </div>
      </div>
      <Tabs base={`/consultorio/pacientes/${id}`} items={tabs} />
      {children}
    </>
  );
}
