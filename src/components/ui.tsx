import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

export const cn = clsx;

const btn = {
  base: "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-[background-color,box-shadow,transform,opacity] duration-200 ease-out-expo active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none",
  size: { sm: "h-8 px-3.5", md: "h-10 px-5" },
  variant: {
    primary: "bg-primary text-primary-fg shadow-soft hover:shadow-lift hover:brightness-110",
    secondary: "bg-surface border border-border hover:border-primary/50 hover:bg-primary-soft/50",
    ghost: "hover:bg-surface-2",
    danger: "bg-danger text-white hover:brightness-110",
  },
};
type BtnProps = { variant?: keyof typeof btn.variant; size?: keyof typeof btn.size };

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & BtnProps) {
  return <button className={cn(btn.base, btn.size[size], btn.variant[variant], className)} {...p} />;
}

export function LinkButton({ variant = "secondary", size = "md", className, ...p }: ComponentProps<typeof Link> & BtnProps) {
  return <Link className={cn(btn.base, btn.size[size], btn.variant[variant], className)} {...p} />;
}

const field = "w-full rounded-xl border border-border bg-surface px-3 text-sm placeholder:text-muted transition-[border-color,box-shadow] duration-200 hover:border-muted/60 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn(field, "h-10", className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cn(field, "h-10", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cn(field, "py-2 min-h-24", className)} {...p} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface p-4 shadow-soft sm:p-5", className)}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

const tones = {
  neutral: "bg-surface-2 text-muted",
  primary: "bg-primary-soft text-primary",
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
};
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-border bg-surface/60 p-8 text-center text-sm text-muted">{children}</p>;
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            {head.map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border [&>tr]:transition-colors [&>tr:hover]:bg-surface-2/60">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ className, ...p }: ComponentProps<"td">) => <td className={cn("px-2 py-2 align-top", className)} {...p} />;

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "primary"; children: ReactNode }) {
  return <div className={cn("rounded-xl px-3.5 py-2.5 text-sm", tones[tone])}>{children}</div>;
}

// Una fecha sin hora ("2026-11-15") es un día de calendario: se formatea en UTC para que no se recorra al día anterior.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const fmtDate = (d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) =>
  d ? new Intl.DateTimeFormat("es-MX", { timeZone: typeof d === "string" && DATE_ONLY.test(d) ? "UTC" : "America/Mexico_City", ...opts }).format(new Date(d)) : "—";
export const fmtDateTime = (d: string | Date | null | undefined) => fmtDate(d, { dateStyle: "medium", timeStyle: "short" });
export const fmtNum = (n: number | string | null | undefined, d = 1) =>
  n === null || n === undefined || n === "" ? "—" : Number(n).toLocaleString("es-MX", { maximumFractionDigits: d });
