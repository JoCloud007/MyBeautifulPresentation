import { describe, it, expect } from "vitest";
import { inferBrandTokens } from "@/lib/brand/infer";
import {
  brandTemplateId,
  brandToTemplate,
  suggestArchetype,
} from "@/lib/brand/toTemplate";
import { importTemplateFromJson } from "@/lib/templateImport";
import { builtInTemplates } from "@/app/stores/templateStore";
import { BrandColorCandidate } from "@/lib/brand/types";
import { contrastRatio } from "@/lib/brand/normalizeColor";

function c(hex: string, weight = 1, evidence = "test"): BrandColorCandidate {
  return { hex, weight, evidence, source: "css" };
}

const lightCharte = [
  c("#ffffff", 10, "--bg"),
  c("#1e40af", 14, "--primary"),
  c("#f59e0b", 8, "--accent"),
  c("#0f172a", 9, "--text"),
  c("#64748b", 6, "--secondary"),
];

describe("brandToTemplate — contrat de sortie", () => {
  const brand = inferBrandTokens(lightCharte, { name: "Acme" });
  const template = brandToTemplate(brand, { name: "Acme Corp" });

  it("produces a template valid for the existing importer", () => {
    // Le vrai contrat : ce que produit le mapping doit passer la validation que
    // le reste de l'app applique déjà à un .mbpt.json importé.
    expect(() => importTemplateFromJson(JSON.parse(JSON.stringify(template)))).not.toThrow();
  });

  it("keeps every color role as a hex string", () => {
    for (const [role, value] of Object.entries(template.colors)) {
      if (role === "name") continue;
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("carries the brand colors through unchanged", () => {
    expect(template.colors.background).toBe("#ffffff");
    // `TemplateColor` n'a que 6 slots : la couleur PRIMAIRE de la marque occupe
    // `accent` (c'est la convention des templates intégrés : corporate y met son
    // bleu #1e40af, secondary le gris). L'accent secondaire ne l'écrase pas.
    expect(template.colors.accent).toBe("#1e40af");
  });

  it("lets the wizard override the identity color", () => {
    const overridden = brandToTemplate(brand, {
      name: "Acme Corp",
      accentOverride: "#f59e0b",
    });
    expect(overridden.colors.accent).toBe("#f59e0b");
  });

  it("keeps the text readable on the background", () => {
    expect(
      contrastRatio(template.colors.foreground, template.colors.background)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("is tagged as a brand template with provenance", () => {
    expect(template.category).toBe("brand");
    expect(template.brand).toBeDefined();
    expect(template.brand!.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("builds a font stack with a real fallback", () => {
    // Sans police identifiée, la chaîne doit rester utilisable telle quelle.
    expect(template.fonts.heading).toMatch(/sans-serif|serif|system-ui|Geist/i);
  });

  it("produces a stable, readable id", () => {
    expect(brandTemplateId("Acme Corp")).toMatch(/^brand-acme-corp-[0-9a-f]{6}$/);
  });

  it("strips accents and spaces from the slug", () => {
    expect(brandTemplateId("Société Générale")).toMatch(/^brand-societe-generale-/);
  });

  it("accepts a deterministic id for seeding", () => {
    const seeded = brandToTemplate(brand, { name: "Acme", id: "brand-acme" });
    expect(seeded.id).toBe("brand-acme");
  });
});

describe("brandToTemplate — archétypes", () => {
  it("suggests a dark archetype for a dark charte", () => {
    const dark = inferBrandTokens([
      c("#0b1020", 12, "--bg"),
      c("#f8fafc", 8, "--text"),
      c("#5eead4", 10, "--accent"),
    ]);
    expect(["dark-tech", "dark-luxury"]).toContain(suggestArchetype(dark));
  });

  it("suggests a light archetype for a light charte", () => {
    const light = inferBrandTokens(lightCharte);
    expect(["corporate", "editorial"]).toContain(suggestArchetype(light));
  });

  it("suggests a serif archetype when the heading font is serif", () => {
    const brand = inferBrandTokens(lightCharte, {
      headingFamily: { family: "Playfair Display", evidence: "thème" },
    });
    expect(suggestArchetype(brand)).toBe("editorial");
  });

  it("honours an explicit archetype", () => {
    const brand = inferBrandTokens(lightCharte);
    const template = brandToTemplate(brand, { name: "Acme", archetype: "minimal" });
    expect(template.defaultSlides).toEqual(builtInTemplates.minimal.defaultSlides);
  });

  it("inherits the archetype's spacing and radii", () => {
    const brand = inferBrandTokens(lightCharte);
    const template = brandToTemplate(brand, { name: "Acme", archetype: "creative" });
    expect(template.spacing).toEqual(builtInTemplates.creative.spacing);
    expect(template.borderRadius).toEqual(builtInTemplates.creative.borderRadius);
  });

  it("flattens a gradient on a light charte (export-safe)", () => {
    const brand = inferBrandTokens(lightCharte);
    const template = brandToTemplate(brand, { name: "Acme", archetype: "tech" });
    expect(template.background!.type).toBe("color");
    expect(template.background!.color).toBe("#ffffff");
  });
});

describe("brandToTemplate — logo et polices", () => {
  const brand = inferBrandTokens(lightCharte, {
    headingFamily: { family: "Acme Sans", evidence: "thème PPTX" },
  });

  it("attaches the chosen logo", () => {
    const template = brandToTemplate(brand, {
      name: "Acme",
      logo: {
        url: "data:image/svg+xml;base64,PHN2Zy8+",
        placement: "header-left",
        maxHeight: 8,
      },
    });
    expect(template.logo?.placement).toBe("header-left");
    expect(template.logo?.maxHeight).toBe(8);
  });

  it("declares font sources for dynamic loading", () => {
    const withFaces = {
      ...brand,
      fonts: {
        ...brand.fonts,
        faces: [{ family: "Acme Sans", url: "/fonts/acme.woff2", weight: "700" }],
      },
    };
    const template = brandToTemplate(withFaces, { name: "Acme" });
    expect(template.fontSources).toHaveLength(1);
    expect(template.fontSources![0].family).toBe("Acme Sans");
  });

  it("drops font faces without a URL", () => {
    const noUrl = {
      ...brand,
      fonts: { ...brand.fonts, faces: [{ family: "Acme Sans" }] },
    };
    const template = brandToTemplate(noUrl, { name: "Acme" });
    expect(template.fontSources).toHaveLength(0);
  });

  it("quotes a multi-word family in the font stack", () => {
    const template = brandToTemplate(brand, { name: "Acme" });
    expect(template.fonts.heading).toContain("'Acme Sans'");
  });
});

describe("brandToTemplate — rétro-compatibilité", () => {
  it("leaves every built-in template untouched", () => {
    // Garde-fou de non-régression : les 9 templates intégrés ne doivent pas
    // dépendre des nouveaux champs optionnels.
    for (const tpl of Object.values(builtInTemplates)) {
      expect(tpl.id).toBeDefined();
      expect(tpl.colors.background).toMatch(/^#|^rgb/);
    }
    expect(Object.keys(builtInTemplates)).toHaveLength(10);
  });

  it("keeps an existing template round-trippable through the importer", () => {
    for (const tpl of Object.values(builtInTemplates)) {
      expect(() => importTemplateFromJson(JSON.parse(JSON.stringify(tpl)))).not.toThrow();
    }
  });
});
