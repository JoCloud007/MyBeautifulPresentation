import { describe, it, expect } from "vitest";
import { inferBrandTokens, MIN_CONTRAST } from "@/lib/brand/infer";
import { contrastRatio } from "@/lib/brand/normalizeColor";
import { BrandColorCandidate } from "@/lib/brand/types";

/** Fabrique un candidat compact pour les scénarios. */
function c(hex: string, weight = 1, evidence = "test"): BrandColorCandidate {
  return { hex, weight, evidence, source: "css" };
}

describe("inferBrandTokens — charte claire réaliste", () => {
  const lightBrand = [
    c("#ffffff", 10, "--acme-bg"),
    c("#1e40af", 14, "--acme-primary"),
    c("#f59e0b", 8, "--acme-accent"),
    c("#64748b", 6, "--acme-secondary"),
    c("#0f172a", 9, "--acme-text"),
    c("#f1f5f9", 5, "--acme-muted"),
    c("#e2e8f0", 5, "--acme-border"),
  ];

  it("assigns all seven roles", () => {
    const brand = inferBrandTokens(lightBrand, { name: "Acme" });
    for (const role of [
      "background",
      "foreground",
      "accent",
      "primary",
      "secondary",
      "muted",
      "border",
    ] as const) {
      expect(brand.colors[role], `role ${role} missing`).toBeDefined();
    }
  });

  it("keeps the light background the brand actually uses", () => {
    const brand = inferBrandTokens(lightBrand);
    expect(brand.colors.background!.value).toBe("#ffffff");
  });

  it("uses a dark foreground that passes WCAG on the background", () => {
    const brand = inferBrandTokens(lightBrand);
    const ratio = contrastRatio(
      brand.colors.foreground!.value,
      brand.colors.background!.value
    );
    expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("honours explicit variable names over raw frequency", () => {
    const brand = inferBrandTokens(lightBrand);
    expect(brand.colors.accent!.value).toBe("#f59e0b");
    expect(brand.colors.accent!.evidence).toContain("--acme-accent");
  });

  it("does not raise a contrast warning when the brand is already compliant", () => {
    const brand = inferBrandTokens(lightBrand);
    expect(brand.warnings.filter((w) => w.includes("contraste"))).toHaveLength(0);
  });

  it("reports a confidence for every assigned role", () => {
    const brand = inferBrandTokens(lightBrand);
    for (const token of Object.values(brand.colors)) {
      expect(token!.confidence).toBeGreaterThan(0);
      expect(token!.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("inferBrandTokens — charte sombre", () => {
  const darkBrand = [
    c("#0b1020", 12, "--bg"),
    c("#f8fafc", 8, "--text"),
    c("#5eead4", 10, "--accent"),
    c("#94a3b8", 5, "--secondary"),
  ];

  it("detects a dark charte and keeps its dark background", () => {
    const brand = inferBrandTokens(darkBrand);
    expect(brand.colors.background!.value).toBe("#0b1020");
  });

  it("produces a light foreground readable on the dark background", () => {
    const brand = inferBrandTokens(darkBrand);
    const ratio = contrastRatio(
      brand.colors.foreground!.value,
      brand.colors.background!.value
    );
    expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("honours the forced dark mode", () => {
    const brand = inferBrandTokens(
      [c("#ffffff", 10), c("#1e40af", 8), c("#111827", 6)],
      { mode: "dark" }
    );
    const ratio = contrastRatio(
      brand.colors.foreground!.value,
      brand.colors.background!.value
    );
    expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
});

describe("inferBrandTokens — robustesse", () => {
  it("returns a neutral fallback palette when there is no candidate", () => {
    const brand = inferBrandTokens([]);
    expect(brand.colors.background).toBeDefined();
    expect(brand.warnings.join(" ")).toContain("Aucune couleur");
  });

  it("handles a single color without crashing", () => {
    const brand = inferBrandTokens([c("#1e40af", 5)]);
    expect(brand.colors.background).toBeDefined();
    expect(brand.colors.foreground).toBeDefined();
    expect(brand.colors.muted).toBeDefined();
  });

  it("keeps muted distinguishable from the background", () => {
    const brand = inferBrandTokens([c("#ffffff", 10), c("#111827", 5)]);
    expect(brand.colors.muted!.value).not.toBe(brand.colors.background!.value);
  });

  it("raises a warning when the foreground had to be invented", () => {
    // Deux couleurs claires : aucune ne peut servir de texte. L'inférence doit
    // garantir la lisibilité ET le dire, jamais choisir en silence.
    const brand = inferBrandTokens([c("#ffffff", 10), c("#eeeeee", 9)]);
    expect(brand.warnings.join(" ")).toMatch(/couleur de texte/i);
    const ratio = contrastRatio(
      brand.colors.foreground!.value,
      brand.colors.background!.value
    );
    expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("warns when no font can be identified", () => {
    const brand = inferBrandTokens([c("#1e40af", 5)]);
    expect(brand.warnings.join(" ")).toMatch(/police/i);
  });

  it("uses an explicit heading family when provided", () => {
    const brand = inferBrandTokens([c("#1e40af", 5)], {
      headingFamily: { family: "Acme Sans", evidence: "thème PPTX" },
    });
    expect(brand.fonts.heading!.value).toBe("Acme Sans");
    expect(brand.fonts.heading!.source).toBe("pptx");
  });

  it("caps the number of exposed color candidates", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      c(`#${(i * 7919).toString(16).padStart(6, "0").slice(0, 6)}`, 1 + (i % 3))
    );
    const brand = inferBrandTokens(many);
    expect(brand.colorCandidates.length).toBeLessThanOrEqual(40);
  });
});
