import { describe, it, expect } from "vitest";
import { parseBrandCss } from "@/lib/brand/parse/css";
import { BrandParseError } from "@/lib/brand/types";

const REALISTIC_CSS = `
/* Charte Acme — v3 */
:root {
  --acme-primary: #1e40af;
  --acme-secondary: #64748b;
  --acme-accent: #f59e0b;
  --acme-bg: #ffffff;
  --acme-text: #0f172a;
  --acme-muted: #f1f5f9;
  --acme-border: #e2e8f0;
  --acme-radius-md: 8px;
  --acme-spacing-md: 16px;
  --acme-font-heading: 'Acme Sans', sans-serif;
  --acme-font-body: "Acme Text", Georgia, serif;
}

@font-face {
  font-family: 'Acme Sans';
  src: url('/fonts/acme-sans.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
}
`;

describe("parseBrandCss", () => {
  it("collects color variables and skips size variables", () => {
    const parsed = parseBrandCss(REALISTIC_CSS, "acme.css");
    const hexes = parsed.candidates.map((c) => c.hex);
    expect(hexes).toContain("#1e40af");
    expect(hexes).toContain("#f59e0b");
    expect(hexes).toContain("#ffffff");
    // `--acme-radius-md: 8px` et `--acme-spacing-md` ne sont pas des couleurs.
    expect(hexes).not.toContain("#000008");
    expect(parsed.notes.join(" ")).toContain("variable");
  });

  it("weights the primary variable above an anonymous hardcoded color", () => {
    const parsed = parseBrandCss(REALISTIC_CSS, "acme.css");
    const primary = parsed.candidates.find((c) => c.hex === "#1e40af")!;
    const neutral = parsed.candidates.find((c) => c.hex === "#e2e8f0")!;
    expect(primary.weight).toBeGreaterThan(neutral.weight);
    expect(primary.evidence).toContain("--acme-primary");
  });

  it("extracts @font-face families and file sources", () => {
    const parsed = parseBrandCss(REALISTIC_CSS, "acme.css");
    expect(parsed.faces).toHaveLength(1);
    expect(parsed.faces[0].family).toBe("Acme Sans");
    expect(parsed.faces[0].url).toBe("/fonts/acme-sans.woff2");
    expect(parsed.faces[0].weight).toBe("700");
  });

  it("detects heading and body families from font-family variables", () => {
    const parsed = parseBrandCss(REALISTIC_CSS, "acme.css");
    const families = parsed.families.map((f) => f.family);
    expect(families).toContain("Acme Sans");
    expect(families).toContain("Acme Text");
  });

  it("ignores generic families", () => {
    const parsed = parseBrandCss(`a { font-family: sans-serif; color: #123456; }`);
    expect(parsed.families).toHaveLength(0);
  });

  it("accepts rgb() and hsl() declarations", () => {
    const parsed = parseBrandCss(
      `:root { --brand-rgb: rgb(30, 64, 175); --brand-hsl: hsl(38, 92%, 50%); }`
    );
    const hexes = parsed.candidates.map((c) => c.hex);
    expect(hexes).toContain("#1e40af");
    // hsl(38, 92%, 50%) vaut exactement #f59f0a. Ce n'est PAS l'amber-500 de
    // Tailwind (#f59e0b), qui est hsl(37.7, 92.1%, 50.2%) — arrondi différent.
    expect(hexes).toContain("#f59f0a");
  });

  it("merges near-duplicate colors instead of listing them twice", () => {
    const parsed = parseBrandCss(
      `:root { --primary: #1e40af; --primary-hover: #1e40b0; }`
    );
    const matches = parsed.candidates.filter((c) => c.hex.startsWith("#1e40"));
    expect(matches).toHaveLength(1);
  });

  it("is tolerant of broken CSS blocks", () => {
    const parsed = parseBrandCss(
      `:root { --primary: #1e40af; } .oops { color: } @media { broken `
    );
    expect(parsed.candidates.map((c) => c.hex)).toContain("#1e40af");
  });

  it("throws a readable error on empty input", () => {
    expect(() => parseBrandCss("", "empty.css")).toThrow(BrandParseError);
    expect(() => parseBrandCss("   ", "empty.css")).toThrow(/vide/);
  });

  it("throws when the file contains neither colors nor fonts", () => {
    expect(() =>
      parseBrandCss(`.a { display: flex; margin: 0; }`, "layout.css")
    ).toThrow(/Aucune couleur ni police/);
  });
});
