import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/brand/analyze/route";

/**
 * Tests de la route d'analyse de charte.
 *
 * On passe par de vrais `File`/`FormData` (api standard, dispo sous Node 20+) :
 * ce qui est vérifié ici, c'est la frontière HTTP — validation du content-type,
 * bornes de taille, et surtout que l'analyse produise bien des tokens.
 */

function makeFormRequest(form: FormData): NextRequest {
  const req = {
    url: "http://localhost:3000/api/brand/analyze",
    method: "POST",
    headers: new Headers(),
    formData: async () => form,
  } as unknown as NextRequest;
  return req;
}

/** Construit une requête dont le content-type annonce un multipart. */
function makeMultipartRequest(form: FormData): NextRequest {
  const req = {
    url: "http://localhost:3000/api/brand/analyze",
    method: "POST",
    headers: new Headers({ "content-type": "multipart/form-data; boundary=x" }),
    formData: async () => form,
  } as unknown as NextRequest;
  return req;
}

const ACME_CSS = `
:root {
  --acme-primary: #0b3d91;
  --acme-accent: #e85d04;
  --acme-background: #ffffff;
  --acme-text: #1a202c;
  --acme-surface: #f7f7f9;
  --acme-border: #e2e8f0;
}
body { font-family: "Acme Text", sans-serif; }
`;

describe("POST /api/brand/analyze", () => {
  it("rejects a non-multipart request", async () => {
    const req = makeFormRequest(new FormData());
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/multipart/i);
  });

  it("rejects a request with no file", async () => {
    const form = new FormData();
    form.append("name", "Acme");
    const res = await POST(makeMultipartRequest(form));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Aucun fichier/i);
  });

  it("rejects an empty file", async () => {
    const form = new FormData();
    form.append("files", new File([], "empty.css", { type: "text/css" }));
    const res = await POST(makeMultipartRequest(form));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/vide/i);
  });

  it("analyses a real CSS charte and returns tokens", async () => {
    const form = new FormData();
    form.append(
      "files",
      new File([ACME_CSS], "acme.css", { type: "text/css" })
    );
    form.append("name", "Acme Industries");

    const res = await POST(makeMultipartRequest(form));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).toBe("Acme Industries");
    expect(body.colors.primary.value).toBe("#0b3d91");
    expect(body.colors.background.value).toBe("#ffffff");
    expect(body.colors.foreground.value).toBe("#1a202c");
    expect(body.fonts.heading.value).toBe("Acme Text");
    expect(Array.isArray(body.perFile)).toBe(true);
    expect(body.perFile[0].ok).toBe(true);
  });

  it("returns 422 (not 500) for an unusable file", async () => {
    const form = new FormData();
    form.append(
      "files",
      new File(["nothing useful here"], "layout.css", { type: "text/css" })
    );
    const res = await POST(makeMultipartRequest(form));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/Aucune couleur ni police/i);
  });

  it("keeps a good file when a sibling file is unusable", async () => {
    const form = new FormData();
    form.append("files", new File([ACME_CSS], "acme.css", { type: "text/css" }));
    form.append(
      "files",
      new File(["just some pixels"], "photo.webp", { type: "image/webp" })
    );
    const res = await POST(makeMultipartRequest(form));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Le CSS a été lu, le webp non supporté : l'import reste utile.
    expect(body.colors.primary.value).toBe("#0b3d91");
    expect(body.perFile.some((f: { ok: boolean }) => f.ok)).toBe(true);
    expect(body.warnings.join(" ")).toMatch(/photo\.webp/i);
  });

  it("sanitises an SVG logo before returning it", async () => {
    const form = new FormData();
    form.append("files", new File([ACME_CSS], "acme.css", { type: "text/css" }));
    form.append(
      "files",
      new File(
        ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>'],
        "logo.svg",
        { type: "image/svg+xml" }
      )
    );
    const res = await POST(makeMultipartRequest(form));
    expect(res.status).toBe(200);
    const body = await res.json();
    const svg = body.icons[0]?.svg ?? "";
    expect(svg).toContain("<rect");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("alert");
  });

  it("honours an explicit dark mode request", async () => {
    const form = new FormData();
    form.append("files", new File([ACME_CSS], "acme.css", { type: "text/css" }));
    form.append("mode", "dark");
    const res = await POST(makeMultipartRequest(form));
    expect(res.status).toBe(200);
    const body = await res.json();
    // En mode sombre forcé, le fond doit être sombre, pas #ffffff.
    expect(body.colors.background.value).not.toBe("#ffffff");
  });
});
