import { describe, it, expect, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const zipFiles: Record<string, string> = {};
  
  class MockJSZip {
    private localFiles: Record<string, string> = {};
    file(path: string, content?: string) {
      if (content !== undefined) {
        this.localFiles[path] = content;
        return this;
      }
      const data = this.localFiles[path];
      if (!data) {
        console.log('MISSING file:', path, 'available:', Object.keys(this.localFiles));
        return undefined;
      }
      return {
        async: (type: string) => {
          if (type === 'text') return Promise.resolve(data);
          throw new Error(`Unsupported async type: ${type}`);
        },
      };
    }
    static async loadAsync(_input: unknown) {
      const z = new MockJSZip();
      z.localFiles = { ...zipFiles };
      console.log('loadAsync called, files:', Object.keys(z.localFiles));
      return z;
    }
  }
  
  return { zipFiles, MockJSZip };
});

vi.mock('jszip', () => ({
  default: hoisted.MockJSZip,
}));

const { importPPTX } = await import('@/lib/pptxImport');

describe('debug', () => {
  it('should find slide file', async () => {
    Object.assign(hoisted.zipFiles, {
      'ppt/presentation.xml': '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>',
      'ppt/_rels/presentation.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>',
      'ppt/slides/slide1.xml': '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Hello</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    });
    
    const file = new File(['dummy'], 'test.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    const result = await importPPTX(file);
    console.log('Result slides:', result.slides);
    expect(result.slides).toHaveLength(1);
  });
});
