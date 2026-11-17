import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

export type Clinic = { name: string; nutritionist_name: string | null; license: string | null; address: string | null; phone: string | null; email: string | null; logo?: string | null; pdf_accent?: string | null; pdf_footer?: string | null; pdf_sections?: Record<string, boolean> | null };

const DEFAULT_ACCENT = "#177a47";
/** Color de acento del consultorio (validado); se usa en el encabezado y los títulos. */
export const accentOf = (clinic: Clinic) => (/^#[0-9a-fA-F]{6}$/.test(clinic.pdf_accent ?? "") ? clinic.pdf_accent! : DEFAULT_ACCENT);

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#1b2420" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, marginBottom: 12 },
  logo: { width: 56, height: 56, objectFit: "contain" },
  h1: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 5 },
  muted: { color: "#5f6b65" },
  row: { flexDirection: "row", borderBottom: "0.5pt solid #e2e5df", paddingVertical: 3 },
  th: { fontFamily: "Helvetica-Bold", backgroundColor: "#f0f2ee" },
  cell: { flex: 1, paddingHorizontal: 3 },
  box: { backgroundColor: "#f0f2ee", padding: 8, borderRadius: 4, marginBottom: 6 },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7.5, color: "#5f6b65", textAlign: "center" },
});

export function Frame({ clinic, title, subtitle, children }: { clinic: Clinic; title: string; subtitle?: string; children: ReactNode }) {
  const accent = accentOf(clinic);
  const foot = clinic.pdf_footer?.trim() || "Documento confidencial";
  return (
    <Document title={title} author={clinic.name}>
      <Page size="LETTER" style={s.page}>
        <View style={[s.header, { borderBottom: `1.5pt solid ${accent}` }]} fixed>
          <View>
            <Text style={[s.h1, { color: accent }]}>{clinic.name}</Text>
            {clinic.nutritionist_name && <Text>{clinic.nutritionist_name}{clinic.license ? ` · Céd. Prof. ${clinic.license}` : ""}</Text>}
            <Text style={s.muted}>{[clinic.address, clinic.phone, clinic.email].filter(Boolean).join(" · ")}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {clinic.logo && <Image src={clinic.logo} style={s.logo} />}
        </View>
        <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>{title}</Text>
        {subtitle && <Text style={[s.muted, { marginBottom: 6 }]}>{subtitle}</Text>}
        {children}
        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${foot} · ${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
}

export function Table({ head, rows, widths }: { head: string[]; rows: (string | number)[][]; widths?: number[] }) {
  return (
    <View>
      <View style={[s.row, s.th]}>{head.map((h, i) => <Text key={i} style={[s.cell, widths ? { flex: widths[i] } : {}]}>{h}</Text>)}</View>
      {rows.map((r, i) => (
        <View key={i} style={s.row} wrap={false}>{r.map((c, j) => <Text key={j} style={[s.cell, widths ? { flex: widths[j] } : {}]}>{String(c)}</Text>)}</View>
      ))}
    </View>
  );
}

export const H2 = ({ children, color = DEFAULT_ACCENT }: { children: ReactNode; color?: string }) => <Text style={[s.h2, { color }]}>{children}</Text>;
export const Box = ({ children }: { children: ReactNode }) => <View style={s.box}>{children}</View>;
export const P = ({ children, muted }: { children: ReactNode; muted?: boolean }) => <Text style={muted ? s.muted : undefined}>{children}</Text>;
export const Bold = ({ children }: { children: ReactNode }) => <Text style={{ fontFamily: "Helvetica-Bold" }}>{children}</Text>;
