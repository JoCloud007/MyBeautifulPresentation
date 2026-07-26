# Plan: PPTX Import & Export Feature

## Overview
Build a robust, professional PPTX import and export system that integrates cleanly into the existing UI. The export must faithfully render all 7 slide layouts with template colors/fonts and notes. The import must parse real-world PPTX files (OOXML) into our `Presentation` model with reasonable layout detection.

## Files to Create

### 1. `app/components/PptxImportDialog.tsx`
- Professional drag-and-drop dialog using shadcn/ui `Dialog`
- Visual drop zone with `Upload` icon, border animation on drag-over
- Hidden file input for click-to-browse fallback
- Loading state with spinner and progress text
- Error alert with red styling
- Success state showing slide count
- Actions: "Remplacer la présentation" vs "Annuler"
- Uses `importPPTX` from `lib/pptxImport.ts`
- Calls `usePresentationStore.getState().setPresentation()` on success

## Files to Modify

### 2. `lib/pptxExport.ts` — Enhanced Export
**Current issues:**
- No notes export
- Template fonts not applied to text elements
- `image-left`/`image-right` mapped to `twoCol` but not rendered as such
- No accent visual elements in exported PPTX

**Changes:**
- Apply `template.fonts.heading` / `template.fonts.body` to all `addText` calls
- Export slide `notes` via `addNotes`
- Fix `image-left`/`image-right` layouts: export as `title-content` equivalent with a placeholder text box on the image side
- Add subtle accent bar shapes (`addShape`) for title and title-content layouts to match preview
- Set default text color from template foreground color
- Keep pptxgenjs master slide background color

### 3. `lib/pptxImport.ts` — Robust Import
**Current issues:**
- `extractTextFromXmlNode` is too shallow; misses deeply nested `a:r` / `a:p` structures
- No notes extraction
- Layout detection is primitive (title+content only)
- No handling of bullet levels
- Image shapes cause empty content

**Changes:**
- Rewrite `extractTextFromXmlNode` to recursively flatten all `a:t` text nodes
- Handle `a:p` paragraph grouping with `\n` separators
- Extract slide notes from `ppt/notesSlides/notesSlideN.xml` via `notesSlide.xml.rels`
- Better layout detection:
  - Count shapes by placeholder type
  - If only title placeholder → `title-only`
  - If only body text → `content-only`
  - If title + body → `title-content`
  - If title + two distinct body text frames → `two-column`
  - Else fallback to `title-content`
- Parse bullet levels from `a:pPr`/`a:lvl` and prefix with `• ` or `- `
- Detect images (`p:pic`) and set layout to `image-left` or `image-right` based on shape position (x coordinate)
- Handle text frames without placeholders (group them as content)

### 4. `app/components/Toolbar.tsx` — Import/Export Integration
**Changes:**
- Add `Import` button next to `Nouveau` that opens `PptxImportDialog`
- Keep existing Export dropdown with PPTX option
- Move import out of `StoryEditor` and into `Toolbar` for discoverability
- Add `FileUp` icon for import

### 5. `app/components/StoryEditor.tsx` — Remove Basic Import
**Changes:**
- Remove the inline `<input type="file">` import UI
- Remove `importError` state
- Remove `handleImport` function
- Keep storytelling textarea and generate button clean
- Import functionality now lives in `Toolbar` via dialog

## Implementation Order
1. Enhance `lib/pptxImport.ts` with robust parsing
2. Enhance `lib/pptxExport.ts` with template fidelity
3. Create `app/components/PptxImportDialog.tsx`
4. Update `Toolbar.tsx` to wire import dialog
5. Clean `StoryEditor.tsx` by removing old import
6. Run quality checks: `tsc`, `eslint`, `npm run build`, `docker build`

## Acceptance Criteria
- [ ] Export produces a downloadable `.pptx` with template colors, fonts, and notes
- [ ] Import accepts drag-and-drop and file-picker PPTX files
- [ ] Imported slides have reasonable titles, content, layout detection, and notes
- [ ] Import dialog shows loading, error, and success states
- [ ] `tsc --noEmit` passes
- [ ] `eslint app/components/` passes
- [ ] `npm run build` passes
- [ ] `docker build` passes
