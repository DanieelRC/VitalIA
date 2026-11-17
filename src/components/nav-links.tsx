"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useEffect, useState } from "react";
import {
  Bell, Camera, Menu, ShieldCheck, Repeat, ShoppingBasket, SlidersHorizontal, Wallet, X, LayoutDashboard, Building2, Receipt, ScrollText, Crown,
  Apple, BookOpen, Bot, CalendarDays, Calculator, ChartLine, ClipboardList, Dumbbell, FileText, FolderOpen, Home,
  MessageCircle, Pill, Salad, Scale, Settings, Soup, Table2, Users, UtensilsCrossed, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: Home, patients: Users, agenda: CalendarDays, messages: MessageCircle, calc: Calculator, bot: Bot, foods: Apple,
  equivalents: Table2, recipes: Soup, supplements: Pill, exercise: Dumbbell, library: BookOpen, reference: FileText,
  settings: Settings, plan: Salad, recall: ClipboardList, progress: ChartLine, files: FolderOpen, scale: Scale, meal: UtensilsCrossed, basket: ShoppingBasket, swap: Repeat, camera: Camera, bell: Bell, wallet: Wallet, sliders: SlidersHorizontal, shield: ShieldCheck, dashboard: LayoutDashboard, clinics: Building2, receipt: Receipt, log: ScrollText, crown: Crown,
};

export type NavItem = { href: string; label: string; section?: string; icon?: string; short?: string };

const isActive = (path: string, href: string) => path === href || (href.split("/").length > 2 && path.startsWith(href + "/"));

/** Navegación lateral sobre el campo verde. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  let lastSection: string | undefined;
  return (
    <nav className="flex flex-col gap-0.5 text-sm">
      {items.map((it) => {
        const active = isActive(path, it.href);
        const header = it.section && it.section !== lastSection ? it.section : null;
        lastSection = it.section;
        const Icon = it.icon ? ICONS[it.icon] : null;
        return (
          <div key={it.href}>
            {header && <p className="mt-5 mb-1 px-3 text-xs font-medium text-field-muted">{header}</p>}
            <Link
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "group flex items-center gap-2.5 rounded-full px-3 py-2 transition-[background-color,color] duration-200",
                active ? "bg-field-fg font-semibold text-field" : "text-field-fg/85 hover:bg-field-2 hover:text-field-fg",
              )}
            >
              {Icon && <Icon className={clsx("size-4 shrink-0 transition-transform duration-300 ease-out-expo", !active && "group-hover:scale-110")} strokeWidth={active ? 2.4 : 2} />}
              <span className="truncate">{it.label}</span>
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

/** Menú desplegable en teléfono: se cierra solo al navegar. */
export function MobileMenu({ brand, children }: { brand: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        {brand}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "Cerrar menú" : "Abrir menú"}
          className="grid size-9 place-items-center rounded-full bg-field-2 transition-transform duration-200 active:scale-95">
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
      <div className={clsx("grid transition-[grid-template-rows] duration-300 ease-out-expo", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden" inert={!open}>
          <div className="max-h-[72vh] overflow-y-auto px-3 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Barra inferior del portal del paciente en teléfono. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {items.map((it) => {
          const active = isActive(path, it.href);
          const Icon = it.icon ? ICONS[it.icon] : Home;
          return (
            <li key={it.href} className="flex-1">
              <Link href={it.href} aria-current={active ? "page" : undefined}
                className={clsx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors", active ? "text-primary" : "text-muted")}>
                <span className={clsx("grid h-7 w-12 place-items-center rounded-full transition-[background-color,transform] duration-300 ease-out-expo", active && "bg-primary-soft scale-105")}>
                  <Icon className="size-[18px]" strokeWidth={active ? 2.4 : 2} />
                </span>
                {it.short ?? it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
