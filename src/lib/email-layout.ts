// Diseño común de los correos de VitalIA. HTML de tablas con estilos en línea (lo que soportan Gmail, Outlook y
// Apple Mail), ancho máximo de 600 px y una versión en texto plano (mejora la entrega y evita el spam).
// Sin dependencias del servidor: también lo usa el script que genera las plantillas de Supabase.

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const C = {
  bg: "#f5f6f2", card: "#ffffff", border: "#dfe3da", text: "#15211b", muted: "#56645c", soft: "#eef0ea",
  field: "#0f3a28", fieldFg: "#f1f7f2", lime: "#a9d544", primary: "#177a47",
};
const TONE = {
  info: { bg: "#dff2e6", fg: "#11603a" },
  warn: { bg: "#fcefc4", fg: "#6b4800" },
  danger: { bg: "#fbe6e1", fg: "#9a2716" },
} as const;
const FONT = "'Onest','Segoe UI',Helvetica,Arial,sans-serif";

export type EmailContent = {
  /** Texto que el buzón muestra junto al asunto (no se ve en el cuerpo) */
  preheader: string;
  /** Etiqueta de color sobre el título: «Urgente», «Recordatorio»… */
  badge?: { label: string; tone: keyof typeof TONE };
  title: string;
  /** Párrafos en HTML; los datos variables ya deben venir escapados con escapeHtml */
  paragraphs: string[];
  /** Tabla de datos (etiqueta → valor, ambos texto plano) */
  details?: [string, string][];
  cta?: { label: string; url: string };
  /** Texto pequeño bajo el botón (caducidad, aviso de seguridad) */
  note?: string;
  /** Por qué recibe este correo */
  footer: string;
};

const stripTags = (html: string) =>
  html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

export function renderEmail(e: EmailContent): { html: string; text: string } {
  const p = (html: string) =>
    `<p style="margin:0 0 14px;font:15px/1.6 ${FONT};color:${C.text}">${html}</p>`;
  const badge = e.badge
    ? `<span style="display:inline-block;margin:0 0 12px;padding:4px 10px;border-radius:999px;background:${TONE[e.badge.tone].bg};color:${TONE[e.badge.tone].fg};font:600 12px/1.4 ${FONT};letter-spacing:.02em">${escapeHtml(e.badge.label)}</span>`
    : "";
  const details = e.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;background:${C.soft};border-radius:12px">
        ${e.details.map(([k, v]) => `<tr>
          <td style="padding:10px 16px;font:13px/1.5 ${FONT};color:${C.muted};width:38%;vertical-align:top">${escapeHtml(k)}</td>
          <td style="padding:10px 16px;font:600 14px/1.5 ${FONT};color:${C.text};vertical-align:top">${escapeHtml(v)}</td></tr>`).join("")}
      </table>`
    : "";
  const url = e.cta ? escapeHtml(e.cta.url) : "";
  const cta = e.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr>
        <td style="border-radius:12px;background:${C.primary}">
          <a href="${url}" style="display:inline-block;padding:13px 26px;font:600 15px/1.2 ${FONT};color:#ffffff;text-decoration:none;border-radius:12px">${escapeHtml(e.cta.label)}</a>
        </td></tr></table>
      <p style="margin:0 0 14px;font:12px/1.5 ${FONT};color:${C.muted}">Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
        <a href="${url}" style="color:${C.primary};word-break:break-all">${url}</a></p>`
    : "";
  const note = e.note ? `<p style="margin:0;font:13px/1.5 ${FONT};color:${C.muted}">${e.note}</p>` : "";

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(e.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(e.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:18px;overflow:hidden">
    <tr><td style="background:${C.field};padding:20px 28px;border-bottom:4px solid ${C.lime}">
      <span style="font:700 22px/1 ${FONT};color:${C.fieldFg};letter-spacing:-.01em">Vital<span style="color:${C.lime}">IA</span></span>
    </td></tr>
    <tr><td style="padding:28px 28px 22px">
      ${badge}
      <h1 style="margin:0 0 16px;font:700 22px/1.3 ${FONT};color:${C.text};letter-spacing:-.01em">${escapeHtml(e.title)}</h1>
      ${e.paragraphs.map(p).join("\n")}
      ${details}${cta}${note}
    </td></tr>
    <tr><td style="padding:16px 28px 22px;border-top:1px solid ${C.border};font:12px/1.6 ${FONT};color:${C.muted}">
      ${e.footer}<br>VitalIA · Software para nutriólogos
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    e.badge ? `[${e.badge.label}]` : "",
    e.title, "",
    ...e.paragraphs.map((x) => stripTags(x)),
    ...(e.details ?? []).map(([k, v]) => `${k}: ${v}`),
    e.cta ? `\n${e.cta.label}: ${e.cta.url}` : "",
    e.note ? `\n${stripTags(e.note)}` : "",
    "\n--", stripTags(e.footer), "VitalIA · Software para nutriólogos",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n").trim();

  return { html, text };
}
