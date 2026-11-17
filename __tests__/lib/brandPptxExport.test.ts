import { describe, it, expect, vi } from "vitest";
import { exportToPPTX } from "@/lib/pptxExport";
import { inferBrandTokens } from "@/lib/brand/infer";
import { brandToTemplate } from "@/lib/brand/toTemplate";
import { BrandColorCandidate } from "@/lib/brand/types";
import { Presentation } from "@/app/types/presentation";

/**
 * Vérifie que la charte client arrive réellement dans le fichier livré.
 *
 * On n'ouvre pas le PPTX (binaire) : on espionne les appels à l'API PptxGenJS,
 * ce qui répond à la vraie question — « le logo et les couleurs de la marque
 * sont-ils effectivement écrits dans chaque slide ? ».
 */

const addImage = vi.fn();
const addText = vi.fn();

vi.mock("pptxgenjs", () => {
  class FakeSlide {
    addImage = addImage;
    addText = addText;
    addNotes = vi.fn();
    addShape = vi.fn();
    addChart = vi.fn();
    addTable = vi.fn();
    background: unknown;
  }
  class FakePptx {
    layout = "";
    title = "";
    subject = "";
    author = "";
    company = "";
    defineSlideMaster = vi.fn();
    addSlide = () => new FakeSlide();
    writeFile = vi.fn(async () => undefined);
    // L'export relit l'archive avec JSZip pour y injecter les métadonnées de
    // scène : le buffer doit donc être un ZIP vide VALIDE, pas 0 octet.
    write = vi.fn(async () => {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      return zip.generateAsync({ type: "arraybuffer" });
    });
  }
  return { default: FakePptx };
});

// Le rendu canvas des chronologies n'existe pas sous jsdom : on le neutralise,
// il est testé ailleurs (`lib/__tests__/pptx.test.ts`).
vi.mock("@/lib/captureChronology", () => ({
  captureGanttChart: vi.fn(async () => null),
  captureTimelineChart: vi.fn(async () => null),
}));

function candidate(hex: string, weight = 10, evidence = "--brand"): BrandColorCandidate {
  return { hex, weight, evidence, source: "css" };
}

const LOGO = "data:image/svg+xml;base64,PHN2Zy8+";

function makeSlide(
  id: string,
  layout: Presentation["slides"][number]["layout"]
): Presentation["slides"][number] {
  return { id, layout, title: "Titre", content: "Contenu", notes: "", elements: [] };
}

function makePresentation(): Presentation {
  // `createdAt`/`updatedAt` sont des timestamps numériques dans ce modèle.
  const now = Date.now();
  return {
    id: "p1",
    title: "Client Deck",
    subtitle: "",
    author: "Test",
    createdAt: now,
    updatedAt: now,
    slides: [makeSlide("s1", "title"), makeSlide("s2", "content-only")],
  };
}

describe("exportToPPTX — charte client", () => {
  it("writes the brand logo into every exported slide", async () => {
    addImage.mockClear();
    const brand = inferBrandTokens([
      candidate("#0b3d91", 14, "--brand-primary"),
      candidate("#ffffff", 10, "--brand-background"),
      candidate("#1a202c", 9, "--brand-text"),
    ]);

    const template = brandToTemplate(brand, {
      name: "Acme",
      logo: { url: LOGO, alt: "Acme", placement: "header-right", maxHeight: 8 },
    });

    await exportToPPTX(makePresentation(), template);

    const logoCalls = addImage.mock.calls.filter(
      (call) => (call[0] as { data?: string })?.data === LOGO
    );
    // Une image de logo par slide : sur 2 slides, 2 appels.
    expect(logoCalls).toHaveLength(2);
  });

  it("places a header logo on the right when asked", async () => {
    addImage.mockClear();
    const brand = inferBrandTokens([candidate("#0b3d91", 14, "--brand-primary")]);
    const template = brandToTemplate(brand, {
      name: "Acme",
      logo: { url: LOGO, placement: "header-right", maxHeight: 8 },
    });

    await exportToPPTX(makePresentation(), template);

    const logoCalls = addImage.mock.calls.filter(
      (call) => (call[0] as { data?: string })?.data === LOGO
    );
    // La 1ʳᵉ slide est un titre : le logo y est déplacé en pied (comportement
    // voulu, vérifié par le test suivant). On contrôle donc la 2ᵉ slide.
    const box = logoCalls[1][0] as { x: string; y: string };
    // En-tête droite : x repoussé vers la droite, y collé en haut.
    expect(parseFloat(box.x)).toBeGreaterThan(50);
    expect(parseFloat(box.y)).toBeLessThan(20);
  });

  it("moves a header logo to the footer on a title slide", async () => {
    addImage.mockClear();
    const brand = inferBrandTokens([candidate("#0b3d91", 14, "--brand-primary")]);
    const template = brandToTemplate(brand, {
      name: "Acme",
      logo: { url: LOGO, placement: "header-left", maxHeight: 8 },
    });
    const presentation = makePresentation();
    presentation.slides = [
      { id: "s1", layout: "title", title: "Titre", content: "", notes: "", elements: [] },
    ] as Presentation["slides"];

    await exportToPPTX(presentation, template);

    const box = addImage.mock.calls.find(
      (call) => (call[0] as { data?: string })?.data === LOGO
    )![0] as { y: string };
    // Sur une page de titre, le logo descend : y > 50 %.
    expect(parseFloat(box.y)).toBeGreaterThan(50);
  });

  it("exports without a logo when the template has none", async () => {
    addImage.mockClear();
    const brand = inferBrandTokens([candidate("#0b3d91", 14, "--brand-primary")]);
    const template = brandToTemplate(brand, { name: "Acme" });

    await exportToPPTX(makePresentation(), template);

    const logoCalls = addImage.mock.calls.filter(
      (call) => (call[0] as { data?: string })?.data === LOGO
    );
    expect(logoCalls).toHaveLength(0);
  });

  it("does not fail the whole export when a logo is unreadable", async () => {
    addImage.mockClear();
    addImage.mockImplementation(() => {
      throw new Error("unsupported image");
    });
    const brand = inferBrandTokens([candidate("#0b3d91", 14, "--brand-primary")]);
    const template = brandToTemplate(brand, {
      name: "Acme",
      logo: { url: "data:image/png;base64,INVALID", placement: "header-left", maxHeight: 8 },
    });

    // Un logo cassé ne doit jamais empêcher la production du PPTX.
    await expect(exportToPPTX(makePresentation(), template)).resolves.not.toThrow();
    addImage.mockReset();
  });
});
