"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const tooltip = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };
const tick = { fontSize: 12, fill: "var(--muted)" };

/** Barras simples para el dashboard del admin (ingresos por mes, altas por semana). */
export function AdminBars({ data, xKey, yKey, label, money }: { data: Record<string, string | number>[]; xKey: string; yKey: string; label: string; money?: boolean }) {
  const fmt = (v: number) => (money ? `$${Number(v).toLocaleString("es-MX", { maximumFractionDigits: 0 })}` : String(v));
  return (
    <div className="h-56 w-full" role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: money ? 8 : -20 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false} />
          <YAxis tick={tick} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={fmt} />
          <Tooltip contentStyle={tooltip} cursor={{ fill: "var(--surface-2)" }} formatter={(v) => [fmt(Number(v)), label]} />
          <Bar dataKey={yKey} fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
