import { describe, expect, it } from "vitest";
import { escapeHtml, safeNext, sameOrigin, verifiedFileType } from "./security";

const ORIGIN = "https://app.vitalia.mx";
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const file = (bytes: number[], type: string, name = "x") => new File([new Uint8Array(bytes)], name, { type });

describe("safeNext (redirección abierta)", () => {
  it("acepta rutas internas", () => expect(safeNext("/invitacion", ORIGIN).href).toBe(`${ORIGIN}/invitacion`));
  it.each(["//evil.com", "/\\evil.com", "/\t/evil.com", "https://evil.com", "\\\\evil.com", "javascript:alert(1)"])(
    "rechaza %j",
    (next) => expect(safeNext(next, ORIGIN).origin).toBe(ORIGIN),
  );
  it("sin parámetro va al inicio", () => expect(safeNext(null, ORIGIN).pathname).toBe("/"));
});

describe("verifiedFileType (contenido real del archivo)", () => {
  it("acepta un PDF real", async () => expect(await verifiedFileType(file([0x25, 0x50, 0x44, 0x46, 0x2d], "application/pdf"), ALLOWED)).toEqual({ mime: "application/pdf", ext: "pdf" }));
  it("acepta un PNG real", async () => expect((await verifiedFileType(file([0x89, 0x50, 0x4e, 0x47, 0x0d], "image/png"), ALLOWED))?.ext).toBe("png"));
  it("rechaza HTML disfrazado de PNG", async () => {
    const html = [...Buffer.from("<html><script>alert(1)</script>")];
    expect(await verifiedFileType(file(html, "image/png", "foto.png"), ALLOWED)).toBeNull();
  });
  it("rechaza tipos no permitidos (SVG, HTML)", async () => {
    expect(await verifiedFileType(file([0x3c, 0x73, 0x76, 0x67], "image/svg+xml"), ALLOWED)).toBeNull();
    expect(await verifiedFileType(file([0x3c, 0x68], "text/html"), ALLOWED)).toBeNull();
  });
  it("la extensión sale del tipo, no del nombre", async () =>
    expect((await verifiedFileType(file([0xff, 0xd8, 0xff, 0xe0], "image/jpeg", "foto.html"), ALLOWED))?.ext).toBe("jpg"));
});

describe("escapeHtml y sameOrigin", () => {
  it("escapa etiquetas y comillas", () => expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe("&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;"));
  const req = (headers: Record<string, string>) => new Request("https://app.vitalia.mx/api/chat", { method: "POST", headers });
  it("acepta el mismo origen", () => expect(sameOrigin(req({ origin: ORIGIN, host: "app.vitalia.mx" }))).toBe(true));
  it("rechaza otro origen", () => expect(sameOrigin(req({ origin: "https://evil.com", host: "app.vitalia.mx" }))).toBe(false));
});
