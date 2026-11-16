"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function Tabs({ base, items }: { base: string; items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="no-print -mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 pb-1 text-sm sm:mx-0 sm:px-0">
      {items.map((t) => {
        const href = base + t.href;
        const active = t.href === "" ? path === base : path.startsWith(href);
        return (
          <Link key={t.href} href={href}
            className={clsx("whitespace-nowrap rounded-full px-3.5 py-1.5 transition-[background-color,color] duration-200", active ? "bg-text font-semibold text-bg" : "text-muted hover:bg-surface-2 hover:text-text")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
