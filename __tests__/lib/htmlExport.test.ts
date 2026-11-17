/**
 * __tests__/lib/htmlExport.test.ts — unit tests of the HTML-first PPTX export
 * engine (Phase 1 of the plan "html-first slide design", work unit "htmlExport
 * unit tests").
 *
 * Covered here (html-to-image is ALWAYS mocked — no real capture):
 *   - mapping slide + template → editable text zones in BOTH export modes
 *     ("design-fidelity" and "native"), always produced by the single source
 *     of truth `lib/htmlExport/textZones.ts`;
 *   - PowerPoint notes exported in both modes;
 *   - file name sanitization (title → safe .pptx name);
 *   - automatic fallback to the native mode when the capture fails (mocked
 *     html-to-image rejecting), without crashing the export.
 *
 * `pptxgenjs` and `jszip` are mocked with in-memory fakes so the tests stay
 * unit-level (same approach as `lib/__tests__/pptx.test.ts`). No existing test
 * is modified, skipped or weakened by this file.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Presentation, Slide } from "@/app/types/presentation";
import type { Template } from "@/app/types/template";
import type { HtmlPptxNotification } from "@/lib/htmlExport/exportHtmlPptx";
import type { TextZone } from "@/lib/htmlExport/textZones";

// ─────────────────────────────────────────────────────────────
// Hoisted mocks (available in vi.mock factories)
// ─────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => {
  const mockAddText = vi.fn<(text: string, options: Record<string, unknown>) => void>();
  const mockAddShape = vi.fn<(name: string, options: Record<string, unknown>) => void>();
  const mockAddNotes = vi.fn<(notes: string) => void>();
  const mockAddImage = vi.fn<(options: Record<string, unknown>) => void>();
  const mockWrite = vi.fn((): Promise<ArrayBuffer> => Promise.resolve(new ArrayBuffer(100)));

  const createdSlides: Array<{ background?: { color: string } }> = [];
  const mockAddSlide = vi.fn(() => {
    const slide = {
      addText: mockAddText,
      addShape: mockAddShape,
      addNotes: mockAddNotes,
      addImage: mockAddImage,
      background: undefined as { color: string } | undefined,
    };
    createdSlides.push(slide);
    return slide;
  });

  const mockPptx = {
    title: "",
    subject: "",
    author: "",
    company: "",
    layout: "",
    addSlide: mockAddSlide,
    write: mockWrite,
  };

  // Controllable html-to-image.toPng mock (PNG data-URL, or rejection).
  const toPngMock = vi.fn<(node: HTMLElement, options?: { pixelRatio?: number }) => Promise<string>>(
    () => Promise.resolve("data:image/png;base64,MOCK_PNG")
  );

  // Minimal in-memory JSZip: enough for the transition/animation injection of
  // lib/htmlExport/exportHtmlPptx.ts (read ppt/slides/slideN.xml → write back).
  class MockJSZip {
    localFiles: Record<string, string> = {};
    static lastLoadedInstance: MockJSZip | null = null;

    file(path: string, content?: string) {
      if (content !== undefined) {
        this.localFiles[path] = content;
        return this;
      }
      const existing = this.localFiles[path];
      if (existing === undefined) return undefined;
      return {
        async: (type: string): Promise<string> => {
          if (type === "text") return Promise.resolve(existing);
          return Promise.reject(new Error(`Unsupported async type: ${type}`));
        },
      };
    }

    generateAsync(): Promise<Blob> {
      return Promise.resolve({ size: 100, type: "application/zip" } as unknown as Blob);
    }

    static async loadAsync(input: unknown): Promise<MockJSZip> {
      const zip = new MockJSZip();
      if (input instanceof ArrayBuffer) {
        MockJSZip.lastLoadedInstance = zip;
        // Pre-seed slide XMLs so the export post-processing can read + modify them.
        for (let i = 1; i <= 10; i++) {
          zip.localFiles[`ppt/slides/slide${i}.xml`] =
            '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"></p:sld>';
        }
      }
      return zip;
    }
  }

  const resetMocks = (): void => {
    mockAddText.mockClear();
    mockAddShape.mockClear();
    mockAddNotes.mockClear();
    mockAddImage.mockClear();
    mockWrite.mockClear();
    mockAddSlide.mockClear();
    createdSlides.length = 0;
    MockJSZip.lastLoadedInstance = null;
    toPngMock.mockReset();
    toPngMock.mockImplementation(() => Promise.resolve("data:image/png;base64,MOCK_PNG"));
  };

  return {
    mockAddText,
    mockAddShape,
    mockAddNotes,
    mockAddImage,
    mockAddSlide,
    mockWrite,
    mockPptx,
    createdSlides,
    toPngMock,
    MockJSZip,
    resetMocks,
  };
});

vi.mock("pptxgenjs", () => ({
  default: vi.fn(function () {
    return hoisted.mockPptx;
  }),
}));

vi.mock("jszip", () => ({
  default: hoisted.MockJSZip,
}));

vi.mock("html-to-image", () => ({
  toPng: hoisted.toPngMock,
  toJpeg: vi.fn(),
  toSvg: vi.fn(),
  toBlob: vi.fn(),
  toCanvas: vi.fn(),
  toPixelData: vi.fn(),
}));

// Import modules under test AFTER the mocks are established.
const { exportHtmlPptx, sanitizeFileName } = await import("@/lib/htmlExport/exportHtmlPptx");
const {
  getTextZones,
  pctToInchesX,
  pctToInchesY,
  pctToInchesW,
  pctToInchesH,
  textZoneToInches,
  SLIDE_WIDTH_IN,
  SLIDE_HEIGHT_IN,
} = await import("@/lib/htmlExport/textZones");
const { captureSlideToPng, tryCaptureSlide, CaptureSlideError } = await import(
  "@/lib/htmlExport/captureSlide"
);

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const testTemplate: Template = {
  id: "test-template",
  name: "Test",
  description: "Test template",
  category: "corporate",
  colors: {
    name: "Test",
    background: "#F8FAFC",
    foreground: "#0F172A",
    accent: "#3B82F6",
    secondary: "#64748B",
    muted: "#E2E8F0",
    border: "#CBD5E1",
  },
  // First family of the CSS stack must be extracted ("Inter" / "Georgia").
  fonts: {
    heading: '"Inter", "Segoe UI", sans-serif',
    body: "Georgia, serif",
  },
  fontSizes: { heading: 48, body: 18 },
  defaultSlides: [],
};

function makeSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: "s1",
    title: "Titre",
    content: "Contenu",
    layout: "title-content",
    ...overrides,
  };
}

function makePresentation(slides: Slide[], title = "Test Presentation"): Presentation {
  return {
    id: "pres-1",
    title,
    subtitle: "A test subtitle",
    author: "Test Author",
    slides,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

/** The exact addText options produced from a text zone (exportHtmlPptx). */
function expectedTextOptions(zone: TextZone): Record<string, unknown> {
  return {
    x: `${zone.xPct}%`,
    y: `${zone.yPct}%`,
    w: `${zone.wPct}%`,
    h: `${zone.hPct}%`,
    fontSize: zone.fontSize,
    fontFace: zone.fontFace,
    color: zone.color.replace(/^#/, ""),
    bold: zone.bold,
    align: zone.align,
    valign: "top",
    margin: 0,
  };
}

/** Every addText call must mirror the textZones source of truth (non-empty zones). */
function expectTextZonesMatch(slide: Slide, template: Template | undefined): void {
  const expectedZones = getTextZones(slide, template).filter(
    (zone) => zone.text.trim() !== ""
  );
  expect(hoisted.mockAddText).toHaveBeenCalledTimes(expectedZones.length);
  for (const [i, zone] of expectedZones.entries()) {
    expect(hoisted.mockAddText.mock.calls[i][0]).toBe(zone.text);
    expect(hoisted.mockAddText.mock.calls[i][1]).toEqual(expectedTextOptions(zone));
  }
}

/** Fast capture options: no font/image deadline can slow the test down. */
const fastCapture = {
  timeoutMs: 5000,
  fontsTimeoutMs: 200,
  imagesTimeoutMs: 200,
  allowFontFallback: true,
};

beforeEach(() => {
  hoisted.resetMocks();
});

// ─────────────────────────────────────────────────────────────
// textZones.ts — single source of truth of the editable zones
// ─────────────────────────────────────────────────────────────

describe("textZones — slide + template → editable text zones", () => {
  it("maps title-content slide: title + content zones with template geometry/fonts/sizes", () => {
    const slide = makeSlide({ layout: "title-content", title: "Titre", content: "Contenu" });
    const zones = getTextZones(slide, testTemplate);
    expect(zones).toEqual([
      {
        text: "Titre",
        xPct: 5,
        yPct: 5.3,
        wPct: 90,
        hPct: 14.2,
        fontSize: 32, // heading 48 × 2/3
        fontFace: "Inter",
        color: "#0F172A",
        align: "left",
        bold: true,
      },
      {
        text: "Contenu",
        xPct: 5,
        yPct: 23.1,
        wPct: 90,
        hPct: 78,
        fontSize: 18, // body 18 × 1
        fontFace: "Georgia",
        color: "#0F172A",
        align: "left",
        bold: false,
      },
    ]);
  });

  it("maps title layout with centered title and secondary-color subtitle", () => {
    const slide = makeSlide({ layout: "title", title: "Titre", content: "Sous-titre" });
    const zones = getTextZones(slide, testTemplate);
    expect(zones).toEqual([
      {
        text: "Titre",
        xPct: 5,
        yPct: 40.9,
        wPct: 90,
        hPct: 21.3,
        fontSize: 40, // heading 48 × 5/6
        fontFace: "Inter",
        color: "#0F172A",
        align: "center",
        bold: true,
      },
      {
        text: "Sous-titre",
        xPct: 5,
        yPct: 65.8,
        wPct: 90,
        hPct: 21.3,
        fontSize: 20, // body 18 × 10/9
        fontFace: "Georgia",
        color: "#64748B", // template.colors.secondary
        align: "center",
        bold: false,
      },
    ]);
  });

  it("splits two-column content on the FIRST pipe into left/right column zones", () => {
    const slide = makeSlide({
      layout: "two-column",
      title: "T",
      content: "Gauche | Droite | reste",
    });
    const zones = getTextZones(slide, testTemplate);
    expect(zones).toHaveLength(3);
    expect(zones[0]).toMatchObject({ text: "T", xPct: 5, yPct: 5.3, wPct: 90, hPct: 14.2 });
    expect(zones[1]).toMatchObject({
      text: "Gauche",
      xPct: 5,
      yPct: 23.1,
      wPct: 44,
      hPct: 75,
      fontSize: 16, // body 18 × 8/9
    });
    expect(zones[2]).toMatchObject({
      text: "Droite | reste", // later pipes stay in the right column
      xPct: 51,
      yPct: 23.1,
      wPct: 44,
      hPct: 75,
      fontSize: 16,
    });
  });

  it("produces a single content zone when two-column content has no pipe", () => {
    const slide = makeSlide({ layout: "two-column", title: "T", content: "Seule colonne" });
    const zones = getTextZones(slide, testTemplate);
    expect(zones.map((z) => z.text)).toEqual(["T", "Seule colonne"]);
  });

  it("maps text/table slide elements to zones, ignores shape/image elements", () => {
    const slide = makeSlide({
      title: "Titre",
      content: "Contenu",
      elements: [
        {
          id: "e1",
          type: "text",
          x: 10,
          y: 20,
          w: 30,
          h: 15,
          content: "Zone canvas",
          style: {
            fontSize: 12,
            fontFamily: "Verdana, sans-serif",
            color: "#123456",
            textAlign: "center",
            fontWeight: 700,
          },
        },
        {
          id: "t1",
          type: "table",
          x: 45,
          y: 20,
          w: 40,
          h: 25,
          content: "A|B",
        },
        {
          id: "sh1",
          type: "shape",
          subtype: "rectangle",
          x: 80,
          y: 10,
          w: 15,
          h: 15,
          style: { backgroundColor: "#3B82F6" },
        },
        {
          id: "im1",
          type: "image",
          x: 80,
          y: 40,
          w: 15,
          h: 15,
          content: "data:image/png;base64,IMG",
        },
      ],
    });
    const zones = getTextZones(slide, testTemplate);
    // A slide with WYSIWYG elements renders those elements ONLY (title/content
    // are not drawn), so only the text/table elements become editable zones.
    expect(zones).toHaveLength(2);
    expect(zones[0]).toEqual({
      text: "Zone canvas",
      xPct: 10,
      yPct: 20,
      wPct: 30,
      hPct: 15,
      fontSize: 12,
      fontFace: "Verdana",
      color: "#123456",
      align: "center",
      bold: true,
    });
    // Table cells default to 10 pt / body font / theme foreground.
    expect(zones[1]).toEqual({
      text: "A|B",
      xPct: 45,
      yPct: 20,
      wPct: 40,
      hPct: 25,
      fontSize: 10,
      fontFace: "Georgia",
      color: "#0F172A",
      align: "left",
      bold: false,
    });
  });

  it("falls back to title-content geometry for unknown layouts", () => {
    const slide = makeSlide({ layout: "mermaid", title: "T", content: "C" });
    const zones = getTextZones(slide, testTemplate);
    expect(zones[0]).toMatchObject({ xPct: 5, yPct: 5.3, wPct: 90, hPct: 14.2, fontSize: 32 });
    expect(zones[1]).toMatchObject({ xPct: 5, yPct: 23.1, wPct: 90, hPct: 78, fontSize: 18 });
  });

  it("converts % coordinates to inches on the 10 × 5.625 in 16:9 slide", () => {
    expect(SLIDE_WIDTH_IN).toBe(10);
    expect(SLIDE_HEIGHT_IN).toBe(5.625);
    expect(pctToInchesX(5)).toBe(0.5);
    expect(pctToInchesW(44)).toBe(4.4);
    expect(pctToInchesY(100)).toBe(5.625);
    expect(pctToInchesH(100)).toBe(5.625);
    expect(pctToInchesY(23.1)).toBeCloseTo(1.299375, 6);

    const slide = makeSlide({ layout: "title-content", title: "Titre", content: "Contenu" });
    const contentZone = getTextZones(slide, testTemplate)[1];
    const inches = textZoneToInches(contentZone);
    expect(inches.x).toBe(0.5);
    expect(inches.y).toBeCloseTo(1.299375, 10);
    expect(inches.w).toBe(9);
    expect(inches.h).toBeCloseTo(4.3875, 10);
  });
});

// ─────────────────────────────────────────────────────────────
// exportHtmlPptx — editable text zones in BOTH modes
// ─────────────────────────────────────────────────────────────

describe("exportHtmlPptx — editable text zones in both modes", () => {
  const slideWithElement = (): Slide =>
    makeSlide({
      title: "Titre",
      content: "Contenu",
      elements: [
        {
          id: "e1",
          type: "text",
          x: 10,
          y: 20,
          w: 30,
          h: 15,
          content: "Zone canvas",
          style: {
            fontSize: 12,
            fontFamily: "Verdana, sans-serif",
            color: "#123456",
            textAlign: "center",
            fontWeight: 700,
          },
        },
      ],
    });

  it("design-fidelity mode: full-bleed PNG background + editable addText zones on top", async () => {
    const slide = slideWithElement();
    const captureSlide = vi.fn((): Promise<string> =>
      Promise.resolve("data:image/png;base64,CAPTURED")
    );
    const result = await exportHtmlPptx(makePresentation([slide]), testTemplate, {
      mode: "design-fidelity",
      download: false,
      captureSlide,
    });

    expect(result.mode).toBe("design-fidelity");
    expect(result.slideModes).toEqual(["design-fidelity"]);
    expect(result.notifications).toEqual([]);
    expect(result.blob).toBeDefined();
    expect(captureSlide).toHaveBeenCalledTimes(1);

    // Full-bleed captured background (text is NOT part of the image).
    expect(hoisted.mockAddImage).toHaveBeenCalledTimes(1);
    expect(hoisted.mockAddImage.mock.calls[0][0]).toMatchObject({
      data: "data:image/png;base64,CAPTURED",
      x: 0,
      y: 0,
      w: 10,
      h: 5.625,
    });

    // Editable text zones: the canvas element ONLY. A slide carrying WYSIWYG
    // elements is rendered from those elements — title/content are not drawn by
    // any renderer, so emitting their zones would duplicate text in the PPTX.
    expectTextZonesMatch(slide, testTemplate);
    expect(hoisted.mockAddText).toHaveBeenCalledTimes(1);
    expect(hoisted.mockAddText.mock.calls[0][0]).toBe("Zone canvas");
    expect(hoisted.mockAddText.mock.calls[0][1]).toMatchObject({
      x: "10%",
      y: "20%",
      w: "30%",
      h: "15%",
      fontSize: 12,
      fontFace: "Verdana",
      align: "center",
      bold: true,
    });
  });

  it("native mode: template background + canvas shapes/images + the same editable zones", async () => {
    const slide = makeSlide({
      title: "Titre",
      content: "Contenu",
      elements: [
        {
          id: "sh1",
          type: "shape",
          subtype: "circle",
          x: 60,
          y: 10,
          w: 20,
          h: 20,
          style: {
            backgroundColor: "#3B82F6",
            borderWidth: 2,
            borderColor: "#123456",
            rotation: 15,
            opacity: 0.5,
          },
        },
        {
          id: "e1",
          type: "text",
          x: 10,
          y: 20,
          w: 30,
          h: 15,
          content: "Zone canvas",
          style: { fontSize: 12, fontFamily: "Verdana, sans-serif", textAlign: "center" },
        },
        {
          id: "t1",
          type: "table",
          x: 10,
          y: 60,
          w: 40,
          h: 30,
          content: "A|B",
        },
        {
          id: "im1",
          type: "image",
          x: 80,
          y: 10,
          w: 15,
          h: 15,
          content: "data:image/png;base64,IMG",
        },
      ],
    });
    const result = await exportHtmlPptx(makePresentation([slide]), testTemplate, {
      mode: "native",
      download: false,
    });

    expect(result.mode).toBe("native");
    expect(result.slideModes).toEqual(["native"]);
    expect(result.notifications).toEqual([]);

    // Template background, stripped of the leading '#'.
    expect(hoisted.createdSlides[0]?.background).toEqual({ color: "F8FAFC" });

    // Canvas circle → native ellipse (editable), mirroring the HTML render.
    expect(hoisted.mockAddShape).toHaveBeenCalledTimes(1);
    expect(hoisted.mockAddShape.mock.calls[0][0]).toBe("ellipse");
    expect(hoisted.mockAddShape.mock.calls[0][1]).toEqual({
      x: "60%",
      y: "10%",
      w: "20%",
      h: "20%",
      fill: { color: "3B82F6", transparency: 50 },
      line: { color: "123456", width: 2, transparency: 50 },
      rotate: 15,
    });

    // Only the image element is added as image (zero full-page image).
    expect(hoisted.mockAddImage).toHaveBeenCalledTimes(1);
    expect(hoisted.mockAddImage.mock.calls[0][0]).toEqual({
      data: "data:image/png;base64,IMG",
      x: "80%",
      y: "10%",
      w: "15%",
      h: "15%",
    });

    // WYSIWYG slide → only its text/table elements are drawn, hence 3 zones
    // (text element + table element; the shape and image add no text zone).
    expectTextZonesMatch(slide, testTemplate);
    expect(hoisted.mockAddText).toHaveBeenCalledTimes(2);
  });

  it("produces IDENTICAL text zones in design-fidelity and native modes (single source of truth)", async () => {
    const slide = slideWithElement();

    await exportHtmlPptx(makePresentation([slide]), testTemplate, {
      mode: "native",
      download: false,
    });
    const nativeCalls = [...hoisted.mockAddText.mock.calls];
    hoisted.mockAddText.mockClear();

    await exportHtmlPptx(makePresentation([slide]), testTemplate, {
      mode: "design-fidelity",
      download: false,
      captureSlide: (): Promise<string> => Promise.resolve("data:image/png;base64,CAPTURED"),
    });
    const designCalls = [...hoisted.mockAddText.mock.calls];

    // WYSIWYG slide → a single editable zone (the canvas text element).
    expect(nativeCalls).toHaveLength(1);
    expect(designCalls).toEqual(nativeCalls);
  });

  it("exports the slide notes in BOTH modes", async () => {
    const slide = makeSlide({ notes: "Notes du présentateur" });

    await exportHtmlPptx(makePresentation([slide]), testTemplate, {
      mode: "design-fidelity",
      download: false,
      captureSlide: (): Promise<string> => Promise.resolve("data:image/png;base64,CAPTURED"),
    });
    expect(hoisted.mockAddNotes).toHaveBeenCalledTimes(1);
    expect(hoisted.mockAddNotes).toHaveBeenCalledWith("Notes du présentateur");
    hoisted.mockAddNotes.mockClear();

    await exportHtmlPptx(makePresentation([slide]), testTemplate, {
      mode: "native",
      download: false,
    });
    expect(hoisted.mockAddNotes).toHaveBeenCalledTimes(1);
    expect(hoisted.mockAddNotes).toHaveBeenCalledWith("Notes du présentateur");
  });

  it("injects the pptxExport transitions/animations into the generated slides", async () => {
    await exportHtmlPptx(makePresentation([makeSlide(), makeSlide({ id: "s2" })]), testTemplate, {
      mode: "native",
      download: false,
    });
    const files = hoisted.MockJSZip.lastLoadedInstance?.localFiles ?? {};
    expect(files["ppt/slides/slide1.xml"]).toContain(
      '<p:transition spd="fast"><p:fade/></p:transition>'
    );
    expect(files["ppt/slides/slide1.xml"]).toContain("<p:timing>");
    expect(files["ppt/slides/slide2.xml"]).toContain(
      '<p:transition spd="fast"><p:push/></p:transition>'
    );
  });
});

// ─────────────────────────────────────────────────────────────
// File name sanitization
// ─────────────────────────────────────────────────────────────

describe("file name sanitization", () => {
  it("removes special characters, keeps letters/digits/-/_ and replaces spaces", () => {
    expect(sanitizeFileName("Hello World!")).toBe("Hello_World");
    expect(sanitizeFileName("Présentation Q1 2026")).toBe("Présentation_Q1_2026");
    expect(sanitizeFileName("My Deck/2026")).toBe("My_Deck2026");
  });

  it('falls back to "presentation" for an empty or missing title', () => {
    expect(sanitizeFileName("@#$%")).toBe("presentation");
    expect(sanitizeFileName(undefined)).toBe("presentation");
    expect(sanitizeFileName("")).toBe("presentation");
  });

  it("downloads the deck under the sanitized presentation title", async () => {
    const onDownload = vi.fn<(blob: Blob, fileName: string) => void>();
    const result = await exportHtmlPptx(makePresentation([makeSlide()], "Hello World!"), testTemplate, {
      mode: "native",
      download: true,
      onDownload,
    });
    expect(result.fileName).toBe("Hello_World");
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onDownload.mock.calls[0][1]).toBe("Hello_World.pptx");
  });

  it("honours the options.fileName override (sanitized too)", async () => {
    const onDownload = vi.fn<(blob: Blob, fileName: string) => void>();
    const result = await exportHtmlPptx(makePresentation([makeSlide()]), testTemplate, {
      mode: "native",
      download: true,
      onDownload,
      fileName: "My Deck/2026",
    });
    expect(result.fileName).toBe("My_Deck2026");
    expect(onDownload.mock.calls[0][1]).toBe("My_Deck2026.pptx");
  });
});

// ─────────────────────────────────────────────────────────────
// captureSlide with mocked html-to-image
// ─────────────────────────────────────────────────────────────

describe("captureSlideToPng with mocked html-to-image", () => {
  it("captures the 1280 × 720 frame at pixelRatio 3 and returns the PNG data-URL", async () => {
    hoisted.toPngMock.mockImplementationOnce(() =>
      Promise.resolve("data:image/png;base64,PNG_OK")
    );
    const dataUrl = await captureSlideToPng(makeSlide(), testTemplate, fastCapture);

    expect(dataUrl).toBe("data:image/png;base64,PNG_OK");
    expect(hoisted.toPngMock).toHaveBeenCalledTimes(1);
    expect(hoisted.toPngMock.mock.calls[0][1]).toEqual({ pixelRatio: 3 });
    const frame = hoisted.toPngMock.mock.calls[0][0];
    expect(frame.style.width).toBe("1280px");
    expect(frame.style.height).toBe("720px");
  });

  it("rejects with a typed capture-error when html-to-image rejects (no crash)", async () => {
    hoisted.toPngMock.mockImplementationOnce(() => Promise.reject(new Error("canvas exploded")));

    await expect(captureSlideToPng(makeSlide(), testTemplate, fastCapture)).rejects.toMatchObject({
      name: "CaptureSlideError",
      reason: "capture-error",
    });

    hoisted.toPngMock.mockImplementationOnce(() => Promise.reject(new Error("canvas exploded")));
    const outcome = await tryCaptureSlide(makeSlide(), testTemplate, fastCapture);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.reason).toBe("capture-error");
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Native fallback when the capture fails
// ─────────────────────────────────────────────────────────────

describe("exportHtmlPptx — native fallback when the capture fails", () => {
  it("falls back to the native mode when html-to-image rejects (default capture path)", async () => {
    hoisted.toPngMock.mockImplementationOnce(() => Promise.reject(new Error("canvas exploded")));
    const slide = makeSlide({ title: "Titre", content: "Contenu" });
    const notifications: HtmlPptxNotification[] = [];

    // The export NEVER throws on a capture failure.
    const result = await exportHtmlPptx(makePresentation([slide]), testTemplate, {
      download: false,
      capture: fastCapture,
      onNotification: (n) => notifications.push(n),
    });

    expect(result.mode).toBe("native");
    expect(result.slideModes).toEqual(["native"]);
    expect(result.blob).toBeDefined();
    expect(notifications.map((n) => n.type)).toEqual(["capture-fallback", "native-fallback"]);
    expect(notifications[0].slideIndex).toBe(0);
    expect(notifications[0].error?.reason).toBe("capture-error");

    // No full-page PNG — the slide is rebuilt natively with editable text.
    expect(hoisted.mockAddImage).not.toHaveBeenCalled();
    expect(hoisted.mockAddText).toHaveBeenCalledTimes(2);
    expect(hoisted.mockAddText.mock.calls.map((c) => c[0])).toEqual(["Titre", "Contenu"]);
  });

  it("rebuilds only the failed slide in native mode when one capture fails", async () => {
    const slides = [
      makeSlide({ id: "s1", title: "Un", content: "Contenu un" }),
      makeSlide({ id: "s2", title: "Deux", content: "Contenu deux" }),
    ];
    const notifications: HtmlPptxNotification[] = [];

    const result = await exportHtmlPptx(makePresentation(slides), testTemplate, {
      download: false,
      captureSlide: (slide: Slide): Promise<string> => {
        if (slide.id === "s2") {
          return Promise.reject(new CaptureSlideError("capture-error", "capture failed (test)"));
        }
        return Promise.resolve("data:image/png;base64,CAPTURED");
      },
      onNotification: (n) => notifications.push(n),
    });

    expect(result.mode).toBe("design-fidelity");
    expect(result.slideModes).toEqual(["design-fidelity", "native"]);
    expect(notifications.map((n) => n.type)).toEqual(["capture-fallback"]);
    expect(notifications[0].slideIndex).toBe(1);
    expect(notifications[0].error?.reason).toBe("capture-error");
    // Only the captured slide gets the full-bleed PNG background.
    expect(hoisted.mockAddImage).toHaveBeenCalledTimes(1);
    // Text zones are editable on both slides.
    expect(hoisted.mockAddText.mock.calls.map((c) => c[0])).toEqual([
      "Un",
      "Contenu un",
      "Deux",
      "Contenu deux",
    ]);
  });

  it("runs the whole export in native mode when every capture fails (with native-fallback notification)", async () => {
    const slides = [makeSlide({ id: "s1" }), makeSlide({ id: "s2" })];
    const notifications: HtmlPptxNotification[] = [];

    const result = await exportHtmlPptx(makePresentation(slides), testTemplate, {
      download: false,
      captureSlide: (): Promise<string> =>
        Promise.reject(new CaptureSlideError("capture-error", "capture failed (test)")),
      onNotification: (n) => notifications.push(n),
    });

    expect(result.mode).toBe("native");
    expect(result.slideModes).toEqual(["native", "native"]);
    expect(notifications.map((n) => n.type)).toEqual([
      "capture-fallback",
      "capture-fallback",
      "native-fallback",
    ]);
    expect(hoisted.mockAddImage).not.toHaveBeenCalled();
    expect(hoisted.mockAddText).toHaveBeenCalledTimes(4);
  });
});
