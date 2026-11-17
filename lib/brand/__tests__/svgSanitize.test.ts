import { describe, it, expect } from "vitest";
import { sanitizeSvg, svgMeta } from "@/lib/brand/parse/svgSanitize";

describe("sanitizeSvg", () => {
  it("keeps a plain icon", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z" fill="#1e40af"/></svg>'
    );
    expect(out).toContain("<svg");
    expect(out).toContain("<path");
    expect(out).toContain('fill="#1e40af"');
  });

  it("removes <script> blocks entirely", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="4" height="4"/></svg>'
    );
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert");
    expect(out).toContain("<rect");
  });

  it("strips event handler attributes", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4" onload="evil()" onclick="evil()"/></svg>'
    );
    expect(out).not.toContain("onload");
    expect(out).not.toContain("onclick");
  });

  it("removes foreignObject (embedded HTML)", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml">hi</body></foreignObject><circle r="3"/></svg>'
    );
    expect(out).not.toContain("foreignObject");
    expect(out).toContain("<circle");
  });

  it("drops external href references", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.test/x.svg#a"/></svg>'
    );
    expect(out).not.toContain("evil.test");
  });

  it("keeps internal fragment references", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="#icon"/></svg>'
    );
    expect(out).toContain('href="#icon"');
  });

  it("drops javascript: URLs", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>'
    );
    expect(out).not.toContain("javascript");
  });

  it("returns null for content with no usable vector", () => {
    expect(sanitizeSvg("<html><body>not an svg</body></html>")).toBeNull();
    expect(sanitizeSvg("")).toBeNull();
    expect(sanitizeSvg("   ")).toBeNull();
  });

  it("returns null when the root svg is missing", () => {
    expect(sanitizeSvg("<path d='M0 0'/>")).toBeNull();
  });

  it("preserves the text content of a text node", () => {
    // Cas réel observé : un logo « icône + nom de marque » en SVG perdait son
    // nom, parce que le sanitizer reconstruisait les balises sans leur contenu.
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32"><text x="28" y="22" fill="#0b3d91">ACME</text></svg>'
    );
    expect(out).toContain(">ACME<");
    expect(out).toContain('viewBox="0 0 120 32"');
  });

  it("keeps viewBox camelCase (SVG is case-sensitive)", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="4" height="4"/></svg>'
    );
    // `viewbox` en minuscules n'est pas reconnu par le navigateur : le SVG
    // s'affiche alors à l'échelle 1:1 et se retrouve tronqué.
    expect(out).toContain("viewBox");
    expect(out).not.toContain("viewbox");
  });

  it("escapes text instead of interpreting it as markup", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><text>&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>'
    );
    // Le contenu reste du TEXTE affichable, jamais une balise exécutable.
    expect(out).not.toContain("<script");
  });

  it("preserves gradients", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect fill="url(#g)"/></svg>'
    );
    // SVG est sensible à la casse : `linearGradient` doit garder son camelCase.
    expect(out).toContain("linearGradient");
    expect(out).toContain("stop-color");
    expect(out).toContain("url(#g)");
  });
});

describe("svgMeta", () => {
  it("extracts the viewBox and length", () => {
    const meta = svgMeta('<svg viewBox="0 0 24 24"></svg>');
    expect(meta.viewBox).toBe("0 0 24 24");
    expect(meta.length).toBeGreaterThan(0);
  });

  it("tolerates a missing viewBox", () => {
    expect(svgMeta("<svg></svg>").viewBox).toBeUndefined();
  });
});
