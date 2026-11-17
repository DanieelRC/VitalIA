import { AppShell } from "@/components/shell";
import { requireRole } from "@/lib/supabase/server";
import { ConsentBanner } from "@/components/consent-banner";

const nav = [
  { href: "/portal", label: "Inicio", icon: "home" },
  // Qué comer
  { href: "/portal/mi-plan", label: "Mi plan", short: "Plan", section: "Qué comer", icon: "plan" },
  { href: "/portal/recetas", label: "Recetas", section: "Qué comer", icon: "recipes" },
  { href: "/portal/intercambios", label: "Intercambios", section: "Qué comer", icon: "swap" },
  { href: "/portal/super", label: "Lista del súper", section: "Qué comer", icon: "basket" },
  // Cómo voy
  { href: "/portal/progreso", label: "Mi progreso", short: "Progreso", section: "Cómo voy", icon: "progress" },
  { href: "/portal/comidas", label: "Fotos de mis comidas", section: "Cómo voy", icon: "camera" },
  { href: "/portal/r24h", label: "Qué comí ayer", section: "Cómo voy", icon: "recall" },
  // Mi nutriólogo
  { href: "/portal/mensajes", label: "Mensajes", section: "Mi nutriólogo", icon: "messages" },
  { href: "/portal/citas", label: "Citas", section: "Mi nutriólogo", icon: "agenda" },
  { href: "/portal/rutinas", label: "Rutinas y suplementos", section: "Mi nutriólogo", icon: "exercise" },
  { href: "/portal/material", label: "Material educativo", section: "Mi nutriólogo", icon: "library" },
  { href: "/portal/archivos", label: "Mis archivos", section: "Mi nutriólogo", icon: "files" },
  // Ayuda
  { href: "/portal/asistente", label: "Pregúntale a Vita", short: "Vita", section: "Ayuda", icon: "bot" },
  { href: "/portal/recordatorios", label: "Recordatorios", section: "Ayuda", icon: "bell" },
  { href: "/portal/mis-datos", label: "Mis datos y privacidad", section: "Ayuda", icon: "shield" },
];
const bottom = ["/portal", "/portal/mi-plan", "/portal/progreso", "/portal/mensajes", "/portal/asistente"].map((h) => nav.find((n) => n.href === h)!);

export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await requireRole("paciente");
  return <AppShell nav={nav} bottomNav={bottom} user={s.fullName ?? s.email}><ConsentBanner patientId={s.patientId} />{children}</AppShell>;
}
