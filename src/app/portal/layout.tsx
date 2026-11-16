import { AppShell } from "@/components/shell";
import { requireRole } from "@/lib/supabase/server";

const nav = [
  { href: "/portal", label: "Inicio", icon: "home" },
  { href: "/portal/mi-plan", label: "Mi plan", short: "Plan", section: "Alimentación", icon: "plan" },
  { href: "/portal/recetas", label: "Recetas", section: "Alimentación", icon: "recipes" },
  { href: "/portal/super", label: "Lista del súper", section: "Alimentación", icon: "basket" },
  { href: "/portal/intercambios", label: "Intercambios", section: "Alimentación", icon: "swap" },
  { href: "/portal/comidas", label: "Mis comidas", section: "Alimentación", icon: "camera" },
  { href: "/portal/r24h", label: "Recordatorio 24 h", section: "Alimentación", icon: "recall" },
  { href: "/portal/rutinas", label: "Rutinas y suplementos", section: "Indicaciones", icon: "exercise" },
  { href: "/portal/progreso", label: "Mi progreso", short: "Progreso", section: "Seguimiento", icon: "progress" },
  { href: "/portal/citas", label: "Citas", section: "Seguimiento", icon: "agenda" },
  { href: "/portal/mensajes", label: "Mensajes", section: "Seguimiento", icon: "messages" },
  { href: "/portal/recordatorios", label: "Recordatorios", section: "Seguimiento", icon: "bell" },
  { href: "/portal/asistente", label: "Asistente Vita", short: "Vita", section: "Ayuda", icon: "bot" },
  { href: "/portal/material", label: "Material educativo", section: "Ayuda", icon: "library" },
  { href: "/portal/archivos", label: "Mis archivos", section: "Ayuda", icon: "files" },
];
const bottom = ["/portal", "/portal/mi-plan", "/portal/progreso", "/portal/mensajes", "/portal/asistente"].map((h) => nav.find((n) => n.href === h)!);

export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await requireRole("paciente");
  return <AppShell nav={nav} bottomNav={bottom} user={s.fullName ?? s.email}>{children}</AppShell>;
}
