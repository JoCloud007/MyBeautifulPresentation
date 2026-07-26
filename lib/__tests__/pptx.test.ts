import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Presentation } from '@/app/types/presentation';
import type { Template } from '@/app/types/template';

// ─────────────────────────────────────────────────────────────
// Hoisted mocks (available in vi.mock factories)
// ─────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => {
  const mockAddText = vi.fn();
  const mockAddShape = vi.fn();
  const mockAddNotes = vi.fn();
  const mockWriteFile = vi.fn();

  const mockSlide = {
    addText: mockAddText,
    addShape: mockAddShape,
    addNotes: mockAddNotes,
    background: undefined as { color: string } | undefined,
  };

  const mockPptx = {
    title: '',
    subject: '',
    author: '',
    company: '',
    layout: '',
    defineSlideMaster: vi.fn(),
    addSlide: vi.fn(() => ({ ...mockSlide })),
    writeFile: mockWriteFile,
    ShapeType: { rect: 'rect' },
  };

  // In-memory file store for mocked JSZip import tests
  const zipFiles: Record<string, string> = {};

  class MockJSZip {
    private localFiles: Record<string, string> = {};

    file(path: string, content?: string) {
      if (content !== undefined) {
        this.localFiles[path] = content;
        return this;
      }
      const data = this.localFiles[path];
      if (!data) return undefined;
      return {
        async: (type: string) => {
          if (type === 'text') return data;
          throw new Error(`Unsupported async type: ${type}`);
        },
      };
    }

    async generateAsync(_opts: unknown) {
      // Return a minimal fake blob that we can wrap in a File
      return { size: 100, type: 'application/zip' } as unknown as Blob;
    }

    static async loadAsync(_input: unknown) {
      const z = new MockJSZip();
      z.localFiles = { ...zipFiles };
      return z;
    }
  }

  return {
    mockPptx,
    mockAddText,
    mockAddShape,
    mockAddNotes,
    mockWriteFile,
    zipFiles,
    MockJSZip,
    clearMocks: () => {
      mockAddText.mockClear();
      mockAddShape.mockClear();
      mockAddNotes.mockClear();
      mockWriteFile.mockClear();
      mockPptx.defineSlideMaster.mockClear();
      mockPptx.addSlide.mockClear();
      mockPptx.title = '';
      mockPptx.subject = '';
      mockPptx.author = '';
      mockPptx.layout = '';
      Object.keys(zipFiles).forEach(k => delete zipFiles[k]);
    },
  };
});

vi.mock('pptxgenjs', () => ({
  default: vi.fn(function () {
    return hoisted.mockPptx;
  }),
}));

vi.mock('jszip', () => ({
  default: hoisted.MockJSZip,
}));

// Import modules AFTER mocks are established
const { exportToPPTX } = await import('@/lib/pptxExport');
const { importPPTX } = await import('@/lib/pptxImport');

// ─────────────────────────────────────────────────────────────
// Helpers for Import Tests
// ─────────────────────────────────────────────────────────────

function makePresentationXml(slideRids: string[]): string {
  const sldIds = slideRids.map((rId, i) => `<p:sldId id="${256 + i}" r:id="${rId}"/>`).join('');
  return `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>${sldIds}</p:sldIdLst>
</p:presentation>`;
}

function makeRelsXml(relationships: Array<{ id: string; type: string; target: string }>): string {
  const rels = relationships.map(r =>
    `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`
  ).join('');
  return `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function makeSlideXml(opts: {
  title?: string;
  subtitle?: string;
  body?: string[];
  pics?: boolean;
  picX?: number;
  bodyFrames?: number;
} = {}): string {
  const shapes: string[] = [];

  if (opts.title !== undefined) {
    shapes.push(`<p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${opts.title}</a:t></a:r></a:p></p:txBody>
    </p:sp>`);
  }

  if (opts.subtitle !== undefined) {
    shapes.push(`<p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Subtitle 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="subTitle" idx="1"/></p:nvPr></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="457200" y="1600200"/><a:ext cx="8229600" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${opts.subtitle}</a:t></a:r></a:p></p:txBody>
    </p:sp>`);
  }

  const bodyCount = opts.bodyFrames ?? (opts.body ? 1 : 0);
  const bodyTexts = opts.body ?? [''];
  for (let i = 0; i < bodyCount; i++) {
    const text = bodyTexts[i] ?? '';
    shapes.push(`<p:sp>
      <p:nvSpPr><p:cNvPr id="${4 + i}" name="Content Placeholder ${3 + i}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="${2 + i}"/></p:nvPr></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="457200" y="${2000000 + i * 1000000}"/><a:ext cx="8229600" cy="${4000000 - i * 1000000}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/>${text.split('\n').map(t => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:txBody>
    </p:sp>`);
  }

  let pics = '';
  if (opts.pics) {
    const x = opts.picX ?? 0;
    pics = `<p:pic>
      <p:nvPicPr><p:cNvPr id="10" name="Picture 1"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
      <p:spPr><a:xfrm><a:off x="${x}" y="0"/><a:ext cx="3000000" cy="3000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
    </p:pic>`;
  }

  return `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>${shapes.join('')}${pics}</p:spTree></p:cSld>
</p:sld>`;
}

function makeNotesXml(notesText: string): string {
  return `<?xml version="1.0"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr>
      <p:spPr/>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${notesText}</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:notes>`;
}

function makeSlideRelsXml(hasNotes: boolean): string {
  const notesRel = hasNotes
    ? '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>'
    : '';
  return `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  ${notesRel}
</Relationships>`;
}

// Populate the mocked JSZip file store and return a dummy File
async function buildMockPptxFile(files: Record<string, string>, fileName = 'test.pptx'): Promise<File> {
  Object.assign(hoisted.zipFiles, files);
  return new File(['dummy'], fileName, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

// Mock crypto.randomUUID for Node test environment
const originalRandomUUID = globalThis.crypto?.randomUUID;
beforeEach(() => {
  globalThis.crypto = globalThis.crypto || {};
  // @ts-expect-error - polyfill for test environment
  globalThis.crypto.randomUUID = () => 'test-uuid-1234';
});

afterEach(() => {
  hoisted.clearMocks();
  if (originalRandomUUID) {
    globalThis.crypto.randomUUID = originalRandomUUID;
  }
});

// ─────────────────────────────────────────────────────────────
// Export Tests
// ─────────────────────────────────────────────────────────────

describe('exportToPPTX', () => {
  const basePresentation: Presentation = {
    id: 'pres-1',
    title: 'Test Presentation',
    subtitle: 'A test subtitle',
    author: 'Test Author',
    slides: [
      { id: 's1', title: 'Slide 1', content: 'Content 1', layout: 'title' },
      { id: 's2', title: 'Slide 2', content: 'Content 2', layout: 'title-content' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const testTemplate: Template = {
    id: 'test-template',
    name: 'Test',
    description: 'Test template',
    category: 'corporate',
    colors: {
      name: 'Test',
      background: 'F8FAFC',
      foreground: '0F172A',
      accent: '3B82F6',
      secondary: '64748B',
      muted: 'E2E8F0',
      border: 'CBD5E1',
    },
    fonts: {
      heading: 'Helvetica',
      body: 'Arial',
    },
    defaultSlides: [],
  };

  it('sets metadata correctly', () => {
    exportToPPTX(basePresentation, testTemplate);
    expect(hoisted.mockPptx.title).toBe('Test Presentation');
    expect(hoisted.mockPptx.subject).toBe('A test subtitle');
    expect(hoisted.mockPptx.author).toBe('Test Author');
    expect(hoisted.mockPptx.company).toBe('MyBeautifulPresentation');
    expect(hoisted.mockPptx.layout).toBe('LAYOUT_16x9');
  });

  it('uses default metadata when optional fields are missing', () => {
    const pres: Presentation = {
      ...basePresentation,
      subtitle: undefined,
      author: undefined,
    };
    exportToPPTX(pres);
    expect(hoisted.mockPptx.subject).toBe('');
    expect(hoisted.mockPptx.author).toBe('MyBeautifulPresentation');
  });

  it('defines slide master when template is provided', () => {
    exportToPPTX(basePresentation, testTemplate);
    expect(hoisted.mockPptx.defineSlideMaster).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'MASTER_SLIDE',
        background: { color: 'F8FAFC' },
      })
    );
  });

  it('creates one slide per presentation slide', () => {
    exportToPPTX(basePresentation);
    expect(hoisted.mockPptx.addSlide).toHaveBeenCalledTimes(basePresentation.slides.length);
  });

  it('sanitizes filename by removing special chars and replacing spaces', () => {
    const pres: Presentation = {
      ...basePresentation,
      title: 'Hello World! @#$%',
    };
    exportToPPTX(pres);
    expect(hoisted.mockPptx.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'Hello_World_.pptx' })
    );
  });

  it('falls back to "presentation" for empty sanitized filename', () => {
    const pres: Presentation = {
      ...basePresentation,
      title: '@#$%',
    };
    exportToPPTX(pres);
    expect(hoisted.mockPptx.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'presentation.pptx' })
    );
  });

  it('renders title layout with accent bar and centered text', () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'My Title', content: 'My Content', layout: 'title' }],
    };
    exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddShape).toHaveBeenCalledWith(
      'rect',
      expect.objectContaining({ x: 0, y: 0, w: '100%', h: 0.08, fill: { color: '3B82F6' } })
    );
    expect(hoisted.mockAddText).toHaveBeenCalledWith(
      'My Title',
      expect.objectContaining({ fontSize: 40, bold: true, align: 'center' })
    );
    expect(hoisted.mockAddText).toHaveBeenCalledWith(
      'My Content',
      expect.objectContaining({ fontSize: 20, align: 'center' })
    );
  });

  it('renders title-only layout with left accent bar', () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'Title Only', content: '', layout: 'title-only' }],
    };
    exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddShape).toHaveBeenCalledWith(
      'rect',
      expect.objectContaining({ x: 0, w: 0.06, h: '70%' })
    );
    expect(hoisted.mockAddText).toHaveBeenCalledWith(
      'Title Only',
      expect.objectContaining({ fontSize: 44, bold: true })
    );
  });

  it('renders content-only layout without title', () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: '', content: 'Just content', layout: 'content-only' }],
    };
    exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddText).toHaveBeenCalledWith(
      'Just content',
      expect.objectContaining({ fontSize: 18, valign: 'top' })
    );
  });

  it('renders two-column layout with vertical divider', () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'Two Col', content: 'Left | Right', layout: 'two-column' }],
    };
    exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Two Col', expect.any(Object));
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Left', expect.objectContaining({ w: '44%' }));
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Right', expect.objectContaining({ w: '44%', x: '51%' }));
    expect(hoisted.mockAddShape).toHaveBeenCalledWith(
      'rect',
      expect.objectContaining({ x: '49.5%', w: 0.01, h: '70%' })
    );
  });

  it('renders image-left layout with muted placeholder panel', () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'Image Left', content: 'Text here', layout: 'image-left' }],
    };
    exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddShape).toHaveBeenCalledWith(
      'rect',
      expect.objectContaining({ x: 0, w: '40%', h: '100%', fill: { color: 'E2E8F0' } })
    );
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Image Left', expect.objectContaining({ x: '44%' }));
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Text here', expect.objectContaining({ x: '44%' }));
  });

  it('renders image-right layout with muted placeholder panel on right', () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'Image Right', content: 'Text here', layout: 'image-right' }],
    };
    exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddShape).toHaveBeenCalledWith(
      'rect',
      expect.objectContaining({ x: '60%', w: '40%', h: '100%', fill: { color: 'E2E8F0' } })
    );
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Image Right', expect.objectContaining({ x: '4%' }));
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Text here', expect.objectContaining({ x: '4%' }));
  });

  it('renders default title-content layout with accent underline', () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'Title', content: 'Body', layout: 'title-content' }],
    };
    exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Title', expect.objectContaining({ fontSize: 32, bold: true }));
    expect(hoisted.mockAddShape).toHaveBeenCalledWith(
      'rect',
      expect.objectContaining({ x: 0.5, y: 1.05, w: 0.5, h: 0.03 })
    );
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Body', expect.objectContaining({ fontSize: 18, valign: 'top' }));
  });

  it('applies template fonts to text elements', () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'T', content: 'C', layout: 'title-content' }],
    };
    exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddText).toHaveBeenCalledWith(
      'T',
      expect.objectContaining({ fontFace: 'Helvetica' })
    );
    expect(hoisted.mockAddText).toHaveBeenCalledWith(
      'C',
      expect.objectContaining({ fontFace: 'Arial' })
    );
  });

  it('adds notes to slide when present', () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'T', content: 'C', layout: 'title-content', notes: 'Speaker note' }],
    };
    exportToPPTX(pres);
    expect(hoisted.mockAddNotes).toHaveBeenCalledWith('Speaker note');
  });

  it('does not add notes when absent', () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'T', content: 'C', layout: 'title-content' }],
    };
    exportToPPTX(pres);
    expect(hoisted.mockAddNotes).not.toHaveBeenCalled();
  });

  it('handles empty slide array gracefully', () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [],
    };
    exportToPPTX(pres);
    expect(hoisted.mockPptx.addSlide).not.toHaveBeenCalled();
    expect(hoisted.mockPptx.writeFile).toHaveBeenCalled();
  });

  it('uses default colors when no template is provided', () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'T', content: 'C', layout: 'title' }],
    };
    exportToPPTX(pres);
    expect(hoisted.mockPptx.defineSlideMaster).not.toHaveBeenCalled();
    expect(hoisted.mockAddShape).toHaveBeenCalledWith(
      'rect',
      expect.objectContaining({ fill: { color: '1e40af' } })
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Import Tests
// ─────────────────────────────────────────────────────────────

describe('importPPTX', () => {
  it('throws when presentation.xml is missing', async () => {
    const file = await buildMockPptxFile({});
    await expect(importPPTX(file)).rejects.toThrow('presentation.xml introuvable');
  });

  it('throws when no slides are found', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml([]),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([]),
    });
    await expect(importPPTX(file)).rejects.toThrow('Aucune slide trouvée');
  });

  it('throws when relationships file is missing', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
    });
    await expect(importPPTX(file)).rejects.toThrow('relations introuvables');
  });

  it('imports a single title slide correctly', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'Hello World' }),
    });

    const result = await importPPTX(file);
    expect(result.title).toBe('test');
    expect(result.slides).toHaveLength(1);
    expect(result.slides[0].title).toBe('Hello World');
    expect(result.slides[0].layout).toBe('title-only');
  });

  it('imports a title + content slide', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'Title', body: ['Some body text'] }),
    });

    const result = await importPPTX(file);
    expect(result.slides[0].title).toBe('Title');
    expect(result.slides[0].content).toBe('• Some body text');
    expect(result.slides[0].layout).toBe('title-content');
  });

  it('imports content-only slide when no title placeholder', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ body: ['Just content'] }),
    });

    const result = await importPPTX(file);
    expect(result.slides[0].layout).toBe('content-only');
    expect(result.slides[0].content).toContain('Just content');
  });

  it('imports subtitle as content when no body exists', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'T', subtitle: 'Sub text' }),
    });

    const result = await importPPTX(file);
    expect(result.slides[0].title).toBe('T');
    expect(result.slides[0].content).toBe('• Sub text');
    expect(result.slides[0].layout).toBe('title-content');
  });

  it('detects two-column layout from two body frames', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'Two Col', body: ['Left text', 'Right text'], bodyFrames: 2 }),
    });

    const result = await importPPTX(file);
    expect(result.slides[0].layout).toBe('two-column');
    expect(result.slides[0].content).toBe('• Left text\n|\n• Right text');
  });

  it('detects image-left layout when picture is on left side', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'Img', body: ['Text'], pics: true, picX: 0 }),
    });

    const result = await importPPTX(file);
    expect(result.slides[0].layout).toBe('image-left');
  });

  it('detects image-right layout when picture is on right side', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'Img', body: ['Text'], pics: true, picX: 4000000 }),
    });

    const result = await importPPTX(file);
    expect(result.slides[0].layout).toBe('image-right');
  });

  it('extracts speaker notes when present', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'With Notes' }),
      'ppt/slides/_rels/slide1.xml.rels': makeSlideRelsXml(true),
      'ppt/notesSlides/notesSlide1.xml': makeNotesXml('These are speaker notes'),
    });

    const result = await importPPTX(file);
    expect(result.slides[0].notes).toBe('These are speaker notes');
  });

  it('returns undefined notes when no notes exist', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'No Notes' }),
      'ppt/slides/_rels/slide1.xml.rels': makeSlideRelsXml(false),
    });

    const result = await importPPTX(file);
    expect(result.slides[0].notes).toBeUndefined();
  });

  it('imports multiple slides in correct order', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2', 'rId3']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
        { id: 'rId3', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide2.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'First' }),
      'ppt/slides/slide2.xml': makeSlideXml({ title: 'Second' }),
    });

    const result = await importPPTX(file);
    expect(result.slides).toHaveLength(2);
    expect(result.slides[0].title).toBe('First');
    expect(result.slides[1].title).toBe('Second');
  });

  it('strips .pptx extension from filename for presentation title', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'T' }),
    }, 'MyDeck.pptx');

    const result = await importPPTX(file);
    expect(result.title).toBe('MyDeck');
  });

  it('handles slide with only subtitle (no title, no body)', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ subtitle: 'Only subtitle' }),
    });

    const result = await importPPTX(file);
    expect(result.slides[0].title).toBe('Slide');
    expect(result.slides[0].content).toContain('Only subtitle');
    expect(result.slides[0].layout).toBe('content-only');
  });

  it('skips empty text shapes gracefully', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Empty Shape"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`,
    });

    const result = await importPPTX(file);
    expect(result.slides[0].title).toBe('Slide');
    expect(result.slides[0].content).toBe('');
  });

  it('handles non-placeholder text shapes as body content', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="TextBox 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Freeform text</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`,
    });

    const result = await importPPTX(file);
    expect(result.slides[0].layout).toBe('content-only');
    expect(result.slides[0].content).toContain('Freeform text');
  });
});
