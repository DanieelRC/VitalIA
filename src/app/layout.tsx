import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Onest, STIX_Two_Text } from "next/font/google";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

/*
  CONTRATO DE DIRECCIÓN (impeccable · seed e22a0faa · dirección elegida por el usuario: "Plato del Bien Comer")
  THESIS: el color es información nutricional. Cada grupo de alimentos tiene un color fijo y cada tiempo de comida
    se dibuja como un plato; se rechaza el dashboard blanco de tarjetas idénticas con un acento verde.
  OWN-WORLD: verde/amarillo/rojo del plato + azul leche, café grasas, rosa azúcares; campo verde profundo en la
    navegación; formas circulares (platos, botones píldora); Bricolage Grotesque en títulos, Onest en texto.
  STORY: el paciente ve qué le toca hoy y cómo va; el nutriólogo captura, calcula y lee sin estorbos.
  FIRST VIEWPORT: (portal) saludo + "Hoy te toca" con un plato por tiempo de comida; (consultorio) navegación en
    campo verde y la tarea al centro.
  FORM: cartel de orientación alimentaria mexicano; candidato 1 de la lista propia.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md,
    and every shipping raster carrying its provenance.
*/
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], display: "swap" });
const body = Onest({ variable: "--font-body", subsets: ["latin"], display: "swap" });
// Tipografía matemática: solo para fórmulas, para que se distingan del texto corrido
const math = STIX_Two_Text({ variable: "--font-math", subsets: ["latin"], style: ["normal", "italic"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "VitalIA", template: "%s · VitalIA" },
  description: "Consulta nutricional: expediente, planes de alimentación, recetas y seguimiento.",
  applicationName: "VitalIA",
  appleWebApp: { capable: true, title: "VitalIA", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f3a28" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1f16" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX">
      <body className={`${display.variable} ${body.variable} ${math.variable} antialiased`}>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
