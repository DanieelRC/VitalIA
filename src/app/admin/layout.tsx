import { AppShell } from "@/components/shell";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: { template: "%s · Admin VitalIA", default: "Admin VitalIA" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireAdmin();
  const nav = [
    { href: "/admin", label: "Dashboard", icon: "dashboard" },
    { href: "/admin/consultorios", label: "Nutriólogos", section: "Clientes", icon: "clinics" },
    { href: "/admin/pagos", label: "Pagos y facturas", section: "Clientes", icon: "receipt" },
    { href: "/admin/configuracion", label: "Facturación y planes", section: "Plataforma", icon: "settings" },
    { href: "/admin/bitacora", label: "Bitácora", section: "Plataforma", icon: "log" },
    ...(s.clinicId && s.role === "nutriologo" ? [{ href: "/consultorio", label: "Ir a mi consultorio", section: "Salir", icon: "home" }] : []),
  ];
  return <AppShell nav={nav} user={`Admin · ${s.email}`}>{children}</AppShell>;
}
