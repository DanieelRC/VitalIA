import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VitalIA — Nutrición",
    short_name: "VitalIA",
    description: "Tu plan de alimentación, recetas, rutinas y seguimiento con tu nutriólogo.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f2",
    theme_color: "#0f3a28",
    lang: "es-MX",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
