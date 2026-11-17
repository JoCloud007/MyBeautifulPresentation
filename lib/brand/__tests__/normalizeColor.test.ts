import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  ensureContrast,
  isNeutral,
  mergeSimilarColors,
  mix,
  normalizeHex,
  relativeLuminance,
  saturation,
} from "@/lib/brand/normalizeColor";

describe("normalizeHex", () => {
  it("expands 3-digit hex", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc");
  });

  it("lowercases 6-digit hex", () => {
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
  });

  it("drops the alpha channel of 8-digit hex", () => {
    expect(normalizeHex("#aabbccff")).toBe("#aabbcc");
  });

  it("accepts rgb() with commas and spaces", () => {
    expect(normalizeHex("rgb(30, 64, 175)")).toBe("#1e40af");
  });

  it("composites rgba() over white", () => {
    // 50% noir sur blanc → gris clair, jamais transparent.
    expect(normalizeHex("rgba(0, 0, 0, 0.5)")).toBe("#808080");
  });

  it("accepts hsl()", () => {
    expect(normalizeHex("hsl(0, 100%, 50%)")).toBe("#ff0000");
  });

  it("maps common CSS names", () => {
    expect(normalizeHex("navy")).toBe("#000080");
    expect(normalizeHex("White")).toBe("#ffffff");
  });

  it("rejects values that are not colors", () => {
    expect(normalizeHex("16px")).toBeNull();
    expect(normalizeHex("var(--x)")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("is 1:1 for identical colors", () => {
    expect(contrastRatio("#1e40af", "#1e40af")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#1e40af", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#1e40af"),
      10
    );
  });
});

describe("ensureContrast", () => {
  it("leaves a compliant color untouched", () => {
    expect(ensureContrast("#111827", "#ffffff")).toBe("#111827");
  });

  it("darkens a too-light foreground on a light background", () => {
    const fixed = ensureContrast("#bbbbbb", "#ffffff");
    expect(fixed).not.toBe("#bbbbbb");
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("lightens a too-dark foreground on a dark background", () => {
    const fixed = ensureContrast("#101010", "#0b1020");
    expect(contrastRatio(fixed, "#0b1020")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("saturation / isNeutral", () => {
  it("reports zero saturation for greys", () => {
    expect(saturation("#808080")).toBeCloseTo(0, 5);
    expect(isNeutral("#808080")).toBe(true);
  });

  it("flags a vivid brand color as non-neutral", () => {
    expect(isNeutral("#1e40af")).toBe(false);
    expect(saturation("#1e40af")).toBeGreaterThan(0.5);
  });
});

describe("relativeLuminance", () => {
  it("is 1 for white and 0 for black", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });
});

describe("mix", () => {
  it("returns the endpoints at ratio 0 and 1", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("returns the midpoint at ratio 0.5", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("mergeSimilarColors", () => {
  it("merges near-identical colors and sums their weight", () => {
    const merged = mergeSimilarColors([
      { hex: "#1e40af", weight: 3, evidence: "a", source: "css" },
      { hex: "#1e40b0", weight: 4, evidence: "b", source: "css" },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].weight).toBe(7);
    expect(merged[0].evidence).toContain("a");
    expect(merged[0].evidence).toContain("b");
  });

  it("keeps clearly distinct colors apart", () => {
    const merged = mergeSimilarColors([
      { hex: "#000000", weight: 1, evidence: "a", source: "css" },
      { hex: "#ffffff", weight: 1, evidence: "b", source: "css" },
    ]);
    expect(merged).toHaveLength(2);
  });
});
