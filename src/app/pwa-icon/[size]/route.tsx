import { ImageResponse } from "next/og";

const pt = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
};
const sector = (from: number, to: number) => `M50 50 L${pt(40, from)} A40 40 0 0 1 ${pt(40, to)} Z`;

// Ícono de la PWA: el plato en tres tercios sobre el verde de la marca.
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const s = size === "512" ? 512 : 192;
  return new ImageResponse(
    (
      <div style={{ width: s, height: s, display: "flex", alignItems: "center", justifyContent: "center", background: "#0f3a28" }}>
        <svg width={s * 0.68} height={s * 0.68} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="48" fill="#ffffff" />
          <path d={sector(0, 120)} fill="#f0b400" stroke="#ffffff" strokeWidth="3" />
          <path d={sector(120, 240)} fill="#d63c2c" stroke="#ffffff" strokeWidth="3" />
          <path d={sector(240, 360)} fill="#2b9a4b" stroke="#ffffff" strokeWidth="3" />
        </svg>
      </div>
    ),
    { width: s, height: s },
  );
}
