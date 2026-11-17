import { importPPTX } from "./lib/pptxImport";
import * as fs from "fs";

async function analyze(path: string) {
  console.log(`\n=== ${path} ===\n`);
  const buffer = fs.readFileSync(path);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const file = new File([arrayBuffer], "test.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  const result = await importPPTX(file);
  console.log(`Title: ${result.title}`);
  console.log(`Slides: ${result.slides.length}`);
  console.log(`Template: ${result.template?.name || "none"}`);
  for (const [index, slide] of result.slides.entries()) {
    console.log(`\n--- Slide ${index + 1} ---`);
    console.log(`  Layout: ${slide.layout}`);
    console.log(`  Title: ${slide.title || "(none)"}`);
    console.log(`  Content lines: ${slide.content?.split("\n").length || 0}`);
    console.log(`  Content preview: ${(slide.content || "").substring(0, 200).replace(/\n/g, " ")}`);
    if (slide.content && slide.content.length > 200) console.log("  ...");
    console.log(`  Has notes: ${!!slide.notes}`);
    console.log(`  ${(slide as any).images?.length || 0} images`);
  }
}

(async () => {
  try {
    await analyze("/Users/math/Downloads/Mon métier - Responsable IaaS 2026-06-14.pptx");
  } catch (e) {
    console.error("Error analyzing first file:", e);
  }
  try {
    await analyze("/Users/math/Downloads/debian_roadmap.pptx");
  } catch (e) {
    console.error("Error analyzing second file:", e);
  }
})();
