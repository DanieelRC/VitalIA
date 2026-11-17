"use client";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["var(--primary)", "var(--info)", "var(--warn)", "var(--danger)"];

export function ProgressChart({ data, series, goal }: { data: Record<string, number | string | null>[]; series: { key: string; label: string }[]; goal?: number | null }) {
  if (data.length < 2) return <p className="text-sm text-muted">Se necesitan al menos dos registros para graficar.</p>;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12, fill: "var(--muted)" }} />
          <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} domain={goal ? [(min: number) => Math.floor(Math.min(min, goal) - 1), (max: number) => Math.ceil(Math.max(max, goal) + 1)] : ["auto", "auto"]} />
          {goal ? <ReferenceLine y={goal} stroke="var(--g-verduras)" strokeDasharray="6 4" label={{ value: `Meta ${goal} kg`, position: "insideTopRight", fontSize: 11, fill: "var(--muted)" }} /> : null}
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
