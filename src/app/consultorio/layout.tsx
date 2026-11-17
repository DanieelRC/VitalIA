import { AppShell } from "@/components/shell";
import { requireRole } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";
import { PlanBanner } from "@/components/plan-banner";

const nav = [
  { href: "/consultorio", label: "Inicio", icon: "home" },
  { href: "/consultorio/pacientes", label: "Pacientes", section: "Consulta", icon: "patients" },
  { href: "/consultorio/agenda", label: "Agenda", section: "Consulta", icon: "agenda" },
  { href: "/consultorio/mensajes", label: "Mensajes", section: "Consulta", icon: "messages" },
  { href: "/consultorio/pagos", label: "Pagos", section: "Consulta", icon: "wallet" },
  { href: "/consultorio/formulas", label: "Calculadora y fórmulas", section: "Herramientas", icon: "calc" },
  { href: "/consultorio/asistente", label: "Asistente IA", section: "Herramientas", icon: "bot" },
  { href: "/consultorio/alimentos", label: "Alimentos", section: "Catálogos", icon: "foods" },
  { href: "/consultorio/equivalentes", label: "Tabla de equivalentes", section: "Catálogos", icon: "equivalents" },
  { href: "/consultorio/recetas", label: "Recetas", section: "Catálogos", icon: "recipes" },
  { href: "/consultorio/suplementos", label: "Suplementos", section: "Catálogos", icon: "supplements" },
  { href: "/consultorio/ejercicios", label: "Ejercicios y rutinas", section: "Catálogos", icon: "exercise" },
  { href: "/consultorio/biblioteca", label: "Material educativo", section: "Anexos", icon: "library" },
  { href: "/consultorio/referencias", label: "Tablas de referencia", section: "Anexos", icon: "reference" },
  { href: "/consultorio/personalizar", label: "Personalizar", section: "Consultorio", icon: "sliders" },
  { href: "/consultorio/ajustes", label: "Ajustes e IA", section: "Consultorio", icon: "settings" },
  { href: "/consultorio/privacidad", label: "Privacidad y ARCO", section: "Consultorio", icon: "shield" },
  { href: "/consultorio/suscripcion", label: "Suscripción", section: "Consultorio", icon: "wallet" },
];

export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await requireRole("nutriologo");
  const items = (await isPlatformAdmin(s.userId)) ? [...nav, { href: "/admin", label: "Administración", section: "VitalIA", icon: "crown" }] : nav;
  return <AppShell nav={items} user={s.fullName ?? s.email}><PlanBanner />{children}</AppShell>;
}
