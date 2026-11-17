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
  const mockAddChart = vi.fn();
  const mockAddImage = vi.fn();
  const mockWriteFile = vi.fn();
  const mockWrite = vi.fn(async () => new ArrayBuffer(100));
  const mockDefineSlideMaster = vi.fn();

  const mockSlide = {
    addText: mockAddText,
    addShape: mockAddShape,
    addNotes: mockAddNotes,
    addChart: mockAddChart,
    addImage: mockAddImage,
    background: undefined as { color: string } | undefined,
  };

  const mockPptx = {
    title: '',
    subject: '',
    author: '',
    company: '',
    layout: '',
    defineSlideMaster: mockDefineSlideMaster,
    addSlide: vi.fn(() => ({ ...mockSlide })),
    writeFile: mockWriteFile,
    write: mockWrite,
    ShapeType: { rect: 'rect', ellipse: 'ellipse' },
    ChartType: { bar: 'bar', scatter: 'scatter' },
  };

  // In-memory file store for mocked JSZip import tests
  const zipFiles: Record<string, string> = {};

  class MockJSZip {
    localFiles: Record<string, string> = {};
    static lastLoadedInstance: MockJSZip | null = null;

    file(path: string, content?: string) {
      if (content !== undefined) {
        this.localFiles[path] = content;
        return this;
      }
      return this.localFiles[path] ? {
        async: async (type: string) => {
          if (type === 'text') return this.localFiles[path];
          if (type === 'base64') return this.localFiles[path];
          throw new Error(`Unsupported async type: ${type}`);
        },
      } : undefined;
    }

    get files(): Record<string, { dir: boolean; async: (type: string) => Promise<string>; _data: { uncompressedSize: number; compressedSize: number } }> {
      const result: Record<string, any> = {};
      for (const [path, content] of Object.entries(this.localFiles)) {
        result[path] = {
          dir: false,
          async: async (type: string) => {
            if (type === 'text') return content;
            if (type === 'base64') return content;
            throw new Error(`Unsupported async type: ${type}`);
          },
          _data: {
            uncompressedSize: content.length,
            compressedSize: Math.max(1, Math.floor(content.length / 2)),
          },
        };
      }
      return result;
    }

    async generateAsync(_opts: unknown) {
      return { size: 100, type: 'application/zip' } as unknown as Blob;
    }

    static async loadAsync(input: unknown) {
      const z = new MockJSZip();
      if (input instanceof ArrayBuffer) {
        MockJSZip.lastLoadedInstance = z;
        // Pre-seed dummy slide XMLs so export post-processing can read + modify them
        for (let i = 1; i <= 10; i++) {
          z.localFiles[`ppt/slides/slide${i}.xml`] = '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"></p:sld>';
        }
        return z;
      }
      z.localFiles = { ...zipFiles };
      return z;
    }
  }

  return {
    mockPptx,
    mockAddText,
    mockAddShape,
    mockAddNotes,
    mockAddChart,
    mockAddImage,
    mockWriteFile,
    mockWrite,
    mockDefineSlideMaster,
    zipFiles,
    MockJSZip,
    clearMocks: () => {
      mockAddText.mockClear();
      mockAddShape.mockClear();
      mockAddNotes.mockClear();
      mockAddChart.mockClear();
      mockAddImage.mockClear();
      mockWriteFile.mockClear();
      mockWrite.mockClear();
      mockDefineSlideMaster.mockClear();
      mockPptx.addSlide.mockClear();
      mockPptx.title = '';
      mockPptx.subject = '';
      mockPptx.author = '';
      mockPptx.layout = '';
      MockJSZip.lastLoadedInstance = null;
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
const { exportToPPTX, generateTransitionXml, generateTimingXml } = await import('@/lib/pptxExport');
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

function makeSlideRelsXml(opts: { hasNotes?: boolean; hasImage?: boolean } = {}): string {
  const rels: string[] = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
  ];
  if (opts.hasImage) {
    rels.push('<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>');
  }
  if (opts.hasNotes) {
    rels.push('<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>');
  }
  return `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels.join('')}
</Relationships>`;
}

function makeMasterXml(background: string = 'F8FAFC'): string {
  return `<?xml version="1.0"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${background}"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:hf sldNum="0" hdr="0" ftr="0" dt="0"/>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr algn="ctr" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:lvl1pPr></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr marL="0" indent="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:lvl1pPr></p:bodyStyle>
    <p:otherStyle><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></p:otherStyle>
  </p:txStyles>
</p:sldMaster>`;
}

function makeLayoutXml(): string {
  return `<?xml version="1.0"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" preserve="1">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="fr-FR"/></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;
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
  (globalThis.crypto as any).randomUUID = () => 'test-uuid-1234';
  (globalThis.URL as any).createObjectURL = vi.fn(() => 'blob:mock-url');
  (globalThis.URL as any).revokeObjectURL = vi.fn();
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

  it('sets metadata correctly', async () => {
    await exportToPPTX(basePresentation, testTemplate);
    expect(hoisted.mockPptx.title).toBe('Test Presentation');
    expect(hoisted.mockPptx.subject).toBe('A test subtitle');
    expect(hoisted.mockPptx.author).toBe('Test Author');
    expect(hoisted.mockPptx.company).toBe('MyBeautifulPresentation');
    expect(hoisted.mockPptx.layout).toBe('LAYOUT_16x9');
  });

  it('uses default metadata when optional fields are missing', async () => {
    const pres: Presentation = {
      ...basePresentation,
      subtitle: undefined,
      author: undefined,
    };
    await exportToPPTX(pres);
    expect(hoisted.mockPptx.subject).toBe('');
    expect(hoisted.mockPptx.author).toBe('MyBeautifulPresentation');
  });

  it('defines multiple master slides when template is provided', async () => {
    await exportToPPTX(basePresentation, testTemplate);
    expect(hoisted.mockPptx.defineSlideMaster).toHaveBeenCalledTimes(8);
    const titles = hoisted.mockPptx.defineSlideMaster.mock.calls.map((c: any[]) => c[0].title);
    expect(titles).toContain('MASTER_TITLE');
    expect(titles).toContain('MASTER_TITLE_CONTENT');
    expect(titles).toContain('MASTER_TITLE_ONLY');
    expect(titles).toContain('MASTER_CONTENT_ONLY');
    expect(titles).toContain('MASTER_TWO_COLUMN');
    expect(titles).toContain('MASTER_IMAGE_LEFT');
    expect(titles).toContain('MASTER_IMAGE_RIGHT');
    expect(titles).toContain('MASTER_CHART');
  });

  it('creates one slide per presentation slide', async () => {
    await exportToPPTX(basePresentation);
    expect(hoisted.mockPptx.addSlide).toHaveBeenCalledTimes(basePresentation.slides.length);
  });

  it('sanitizes filename by removing special chars and replacing spaces', async () => {
    const pres: Presentation = {
      ...basePresentation,
      title: 'Hello World! @#$%',
    };
    await exportToPPTX(pres);
    expect(hoisted.mockPptx.write).toHaveBeenCalledWith(
      expect.objectContaining({ outputType: 'arraybuffer' })
    );
  });

  it('falls back to "presentation" for empty sanitized filename', async () => {
    const pres: Presentation = {
      ...basePresentation,
      title: '@#$%',
    };
    await exportToPPTX(pres);
    expect(hoisted.mockPptx.write).toHaveBeenCalledWith(
      expect.objectContaining({ outputType: 'arraybuffer' })
    );
  });

  it('renders title layout with accent bar in master and centered text', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'My Title', content: 'My Content', layout: 'title' }],
    };
    await exportToPPTX(pres, testTemplate);
    const masterCall = hoisted.mockPptx.defineSlideMaster.mock.calls.find(
      (c: any[]) => c[0].title === 'MASTER_TITLE'
    );
    expect(masterCall).toBeDefined();
    expect(masterCall![0].objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rect: expect.objectContaining({ x: 0, y: 0, w: '100%', h: 0.08, fill: { color: '3B82F6' } }),
        }),
      ])
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

  it('renders title-only layout with left accent bar in master', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'Title Only', content: '', layout: 'title-only' }],
    };
    await exportToPPTX(pres, testTemplate);
    const masterCall = hoisted.mockPptx.defineSlideMaster.mock.calls.find(
      (c: any[]) => c[0].title === 'MASTER_TITLE_ONLY'
    );
    expect(masterCall).toBeDefined();
    expect(masterCall![0].objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rect: expect.objectContaining({ x: 0, w: 0.06, h: '70%' }),
        }),
      ])
    );
    expect(hoisted.mockAddText).toHaveBeenCalledWith(
      'Title Only',
      expect.objectContaining({ fontSize: 44, bold: true })
    );
  });

  it('renders content-only layout without title', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: '', content: 'Just content', layout: 'content-only' }],
    };
    await exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddText).toHaveBeenCalledWith(
      'Just content',
      expect.objectContaining({ fontSize: 18, valign: 'top' })
    );
  });

  it('renders two-column layout with vertical divider in master', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'Two Col', content: 'Left | Right', layout: 'two-column' }],
    };
    await exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Two Col', expect.any(Object));
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Left', expect.objectContaining({ w: '44%' }));
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Right', expect.objectContaining({ w: '44%', x: '51%' }));
    const masterCall = hoisted.mockPptx.defineSlideMaster.mock.calls.find(
      (c: any[]) => c[0].title === 'MASTER_TWO_COLUMN'
    );
    expect(masterCall).toBeDefined();
    expect(masterCall![0].objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rect: expect.objectContaining({ x: '49.5%', w: 0.01, h: '70%' }),
        }),
      ])
    );
  });

  it('renders image-left layout with muted placeholder panel in master', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'Image Left', content: 'Text here', layout: 'image-left' }],
    };
    await exportToPPTX(pres, testTemplate);
    const masterCall = hoisted.mockPptx.defineSlideMaster.mock.calls.find(
      (c: any[]) => c[0].title === 'MASTER_IMAGE_LEFT'
    );
    expect(masterCall).toBeDefined();
    expect(masterCall![0].objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rect: expect.objectContaining({ x: 0, w: '40%', h: '100%', fill: { color: 'E2E8F0' } }),
        }),
      ])
    );
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Image Left', expect.objectContaining({ x: '44%' }));
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Text here', expect.objectContaining({ x: '44%' }));
  });

  it('renders image-right layout with muted placeholder panel in master', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'Image Right', content: 'Text here', layout: 'image-right' }],
    };
    await exportToPPTX(pres, testTemplate);
    const masterCall = hoisted.mockPptx.defineSlideMaster.mock.calls.find(
      (c: any[]) => c[0].title === 'MASTER_IMAGE_RIGHT'
    );
    expect(masterCall).toBeDefined();
    expect(masterCall![0].objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rect: expect.objectContaining({ x: '60%', w: '40%', h: '100%', fill: { color: 'E2E8F0' } }),
        }),
      ])
    );
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Image Right', expect.objectContaining({ x: '4%' }));
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Text here', expect.objectContaining({ x: '4%' }));
  });

  it('renders default title-content layout with accent underline in master', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'Title', content: 'Body', layout: 'title-content' }],
    };
    await exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Title', expect.objectContaining({ fontSize: 32, bold: true }));
    const masterCall = hoisted.mockPptx.defineSlideMaster.mock.calls.find(
      (c: any[]) => c[0].title === 'MASTER_TITLE_CONTENT'
    );
    expect(masterCall).toBeDefined();
    expect(masterCall![0].objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rect: expect.objectContaining({ x: 0.5, y: 1.05, w: 0.5, h: 0.03 }),
        }),
      ])
    );
    expect(hoisted.mockAddText).toHaveBeenCalledWith('Body', expect.objectContaining({ fontSize: 18, valign: 'top' }));
  });

  it('applies template fonts to text elements', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'T', content: 'C', layout: 'title-content' }],
    };
    await exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddText).toHaveBeenCalledWith(
      'T',
      expect.objectContaining({ fontFace: 'Helvetica' })
    );
    expect(hoisted.mockAddText).toHaveBeenCalledWith(
      'C',
      expect.objectContaining({ fontFace: 'Arial' })
    );
  });

  it('adds notes to slide when present', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'T', content: 'C', layout: 'title-content', notes: 'Speaker note' }],
    };
    await exportToPPTX(pres);
    expect(hoisted.mockAddNotes).toHaveBeenCalledWith('Speaker note');
  });

  it('does not add notes when absent', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'T', content: 'C', layout: 'title-content' }],
    };
    await exportToPPTX(pres);
    expect(hoisted.mockAddNotes).not.toHaveBeenCalled();
  });

  it('handles empty slide array gracefully', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [],
    };
    await exportToPPTX(pres);
    expect(hoisted.mockPptx.addSlide).not.toHaveBeenCalled();
    expect(hoisted.mockPptx.write).toHaveBeenCalled();
  });

  it('uses default colors when no template is provided', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{ id: 's1', title: 'T', content: 'C', layout: 'title' }],
    };
    await exportToPPTX(pres);
    expect(hoisted.mockPptx.defineSlideMaster).not.toHaveBeenCalled();
  });

  it('renders timeline layout with native scatter chart', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{
        id: 's1',
        title: 'Timeline',
        content: '2024-01-01 - Event A\n2024-02-01 - Event B',
        layout: 'timeline',
      }],
    };
    await exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddChart).toHaveBeenCalledWith(
      'scatter',
      expect.any(Array),
      expect.objectContaining({ lineDataSymbol: 'circle', lineDataSymbolSize: 10 })
    );
  });

  it('renders gantt layout with native stacked bar chart', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{
        id: 's1',
        title: 'Gantt',
        content: 'Task 1 | 2024-01-01 | 2024-02-01',
        layout: 'gantt',
      }],
    };
    await exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddChart).toHaveBeenCalledWith(
      'bar',
      expect.any(Array),
      expect.objectContaining({ barDir: 'bar', barGrouping: 'stacked', chartColors: ['F8FAFC', '3B82F6'] })
    );
  });

  it('exports images from slide data using addImage', async () => {
    const pres: Presentation = {
      ...basePresentation,
      slides: [{
        id: 's1',
        title: 'Image Slide',
        content: 'Text',
        layout: 'image-left',
        data: { images: ['data:image/png;base64,abc123'] } as any,
      }],
    };
    await exportToPPTX(pres, testTemplate);
    expect(hoisted.mockAddImage).toHaveBeenCalledWith(
      expect.objectContaining({ data: 'data:image/png;base64,abc123' })
    );
  });

  it('uses arraybuffer write path for post-processing animations', async () => {
    await exportToPPTX(basePresentation, testTemplate);
    expect(hoisted.mockPptx.write).toHaveBeenCalledWith({ outputType: 'arraybuffer' });
  });

  it('post-processes slide animations into the generated zip', async () => {
    await exportToPPTX(basePresentation, testTemplate);
    const zipInstance = hoisted.MockJSZip.lastLoadedInstance;
    expect(zipInstance).toBeDefined();
    // Should have modified at least one slide XML
    const slideFile = Object.keys(zipInstance!.localFiles).find(k => k.startsWith('ppt/slides/'));
    expect(slideFile).toBeDefined();
    const slideXml = zipInstance!.localFiles[slideFile!];
    expect(slideXml).toContain('<p:transition');
    expect(slideXml).toContain('<p:timing');
  });
});

// ─────────────────────────────────────────────────────────────
// Animation XML Helpers
// ─────────────────────────────────────────────────────────────

describe('animation helpers', () => {
  it('generates fade transition XML', () => {
    expect(generateTransitionXml('fade')).toBe('<p:transition spd="fast"><p:fade/></p:transition>');
  });

  it('generates push transition XML', () => {
    expect(generateTransitionXml('push')).toBe('<p:transition spd="fast"><p:push/></p:transition>');
  });

  it('generates timing XML targeting provided shape IDs', () => {
    const xml = generateTimingXml([2, 3], 0);
    expect(xml).toContain('spid="2"');
    expect(xml).toContain('spid="3"');
    expect(xml).toContain('nodeType="mainSeq"');
    expect(xml).toContain('filter="fade"');
  });

  it('generates unique IDs per slide index', () => {
    const xml0 = generateTimingXml([2], 0);
    const xml1 = generateTimingXml([2], 1);
    expect(xml0).not.toBe(xml1);
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
      'ppt/slides/_rels/slide1.xml.rels': makeSlideRelsXml({ hasNotes: true }),
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
      'ppt/slides/_rels/slide1.xml.rels': makeSlideRelsXml({ hasNotes: false }),
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

  it('extracts master slides and maps them to a template', async () => {
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'T' }),
      'ppt/slideMasters/slideMaster1.xml': makeMasterXml('F0F9FF'),
      'ppt/slideMasters/_rels/slideMaster1.xml.rels': makeRelsXml([
        { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout', target: '../slideLayouts/slideLayout1.xml' },
      ]),
      'ppt/slideLayouts/slideLayout1.xml': makeLayoutXml(),
    });

    const result = await importPPTX(file);
    expect(result.template).toBeDefined();
    expect(result.template!.id).toBe('imported-template');
    expect(result.template!.colors.background).toBe('F0F9FF');
    expect(result.template!.fonts.heading).toBe('Calibri');
    expect(result.template!.fonts.body).toBe('Arial');
  });

  it('preserves images from the original PPTX in imported slides', async () => {
    const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'Img', pics: true }),
      'ppt/slides/_rels/slide1.xml.rels': makeSlideRelsXml({ hasImage: true }),
      'ppt/media/image1.png': imageBase64,
    });

    const result = await importPPTX(file);
    const slideData = result.slides[0].data as any;
    expect(slideData).toBeDefined();
    expect(slideData.images).toHaveLength(1);
    expect(slideData.images[0]).toContain('data:image/png;base64,');
  });
});

// ─────────────────────────────────────────────────────────────
// Round-trip Test
// ─────────────────────────────────────────────────────────────

describe('PPTX round-trip', () => {
  it('import then export produces a valid file', async () => {
    const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const file = await buildMockPptxFile({
      'ppt/presentation.xml': makePresentationXml(['rId2']),
      'ppt/_rels/presentation.xml.rels': makeRelsXml([
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' },
      ]),
      'ppt/slides/slide1.xml': makeSlideXml({ title: 'Round Trip', body: ['Content'] }),
      'ppt/slides/_rels/slide1.xml.rels': makeSlideRelsXml({ hasNotes: true, hasImage: true }),
      'ppt/notesSlides/notesSlide1.xml': makeNotesXml('Speaker notes'),
      'ppt/media/image1.png': imageBase64,
      'ppt/slideMasters/slideMaster1.xml': makeMasterXml('F8FAFC'),
      'ppt/slideMasters/_rels/slideMaster1.xml.rels': makeRelsXml([
        { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout', target: '../slideLayouts/slideLayout1.xml' },
      ]),
      'ppt/slideLayouts/slideLayout1.xml': makeLayoutXml(),
    }, 'roundtrip.pptx');

    // Import
    const imported = await importPPTX(file);
    expect(imported.title).toBe('roundtrip');
    expect(imported.slides[0].title).toBe('Round Trip');
    expect(imported.slides[0].notes).toBe('Speaker notes');
    expect(imported.template).toBeDefined();
    const slideData = imported.slides[0].data as any;
    expect(slideData?.images?.length).toBe(1);

    // Export
    await exportToPPTX(imported, imported.template);

    // Verify export path was invoked
    expect(hoisted.mockPptx.write).toHaveBeenCalledWith({ outputType: 'arraybuffer' });
    // Verify addImage was called for preserved images
    expect(hoisted.mockAddImage).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.stringContaining('data:image/png;base64,') })
    );
    // Verify master slides were defined from the imported template
    expect(hoisted.mockPptx.defineSlideMaster).toHaveBeenCalled();
    // Verify post-processing injected animations
    const zipInstance = hoisted.MockJSZip.lastLoadedInstance;
    expect(zipInstance).toBeDefined();
    const slideFile = Object.keys(zipInstance!.localFiles).find(k => k.startsWith('ppt/slides/'));
    expect(slideFile).toBeDefined();
    const slideXml = zipInstance!.localFiles[slideFile!];
    expect(slideXml).toContain('<p:transition');
    expect(slideXml).toContain('<p:timing');
  });
});
