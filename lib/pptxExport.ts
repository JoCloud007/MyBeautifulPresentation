import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import mermaid from "mermaid";
import { Presentation, PowerBiConfig, GanttTask, TimelineEvent } from "@/app/types/presentation";
import { Template } from "@/app/types/template";
import {
  parseGanttContent,
  parseTimelineContent,
  getDateRange,
  getTimelineDateRange,
  generateScaleMarkers,
  resolveTimeScale,
  getTaskPosition,
} from "@/lib/ganttParser";
import { captureGanttChart, captureTimelineChart } from "@/lib/captureChronology";

function stripHash(color: string): string {
  return color.startsWith("#") ? color.slice(1) : color;
}

/**
 * Position et taille du logo dans une slide exportée.
 *
 * Deux contraintes propres au PPTX :
 *  - les coordonnées sont en % de la slide : un logo de 8 % de haut garde la
 *    même proportion quel que soit le format de sortie ;
 *  - sur une page de titre, un logo en en-tête chevaucherait le titre. Il est
 *    donc déplacé en pied pour ce layout précis.
 *
 * La largeur est approximée : on ne mesure pas l'image ici (pas de canvas côté
 * serveur), donc la boîte est plus large que le logo et PptxGenJS le contient
 * sans le déformer.
 */
type PercentCoord = `${number}%`;

function logoBoxFor(
  logo: { placement: string; maxHeight: number },
  layout: string
): { x: PercentCoord; y: PercentCoord; w: PercentCoord; h: PercentCoord } {
  const rawHeight = Number(logo.maxHeight);
  const h = Number.isFinite(rawHeight) ? Math.max(2, Math.min(20, rawHeight)) : 8;
  const w = h * 2.2;
  const margin = 4;
  const pct = (value: number): PercentCoord => `${value}%`;

  const isTitleLayout = layout === "title" || layout === "title-only";
  let placement = logo.placement;
  if (isTitleLayout && (placement === "header-left" || placement === "header-right")) {
    placement = "footer-left";
  }

  const width = pct(w);
  const height = pct(h);
  const top = pct(Math.max(2, margin / 2));

  switch (placement) {
    case "header-right":
      return { x: pct(100 - margin - w), y: top, w: width, h: height };
    case "title":
      return { x: pct(margin), y: pct(88 - h), w: width, h: height };
    case "footer-left":
      return { x: pct(margin), y: pct(97 - h), w: width, h: height };
    case "footer-right":
      return { x: pct(100 - margin - w), y: pct(97 - h), w: width, h: height };
    case "header-left":
    default:
      return { x: pct(margin), y: top, w: width, h: height };
  }
}

function extractFirstFont(fontStack: string): string {
  return fontStack.split(",")[0].trim();
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgToBase64(svg: string): string {
  // Unicode-safe base64 encoding (btoa fails on non-ASCII)
  const bytes = new TextEncoder().encode(svg);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary);
}

function parseDurationDays(duration: string): number {
  const match = duration.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 7;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function generateTransitionXml(type: "fade" | "push"): string {
  const tag = type === "fade" ? "fade" : "push";
  return `<p:transition spd="fast"><p:${tag}/></p:transition>`;
}

export function generateTimingXml(shapeIds: number[], slideIdx: number): string {
  const baseId = 100 + slideIdx * 10000;
  let xml = "<p:timing><p:tnLst><p:par>";
  xml += `<p:cTn id="${baseId}" dur="indefinite" restart="never" nodeType="tmRoot">`;
  xml += '<p:childTnLst><p:seq concurrent="1" nextAc="seek">';
  xml += `<p:cTn id="${baseId + 1}" dur="indefinite" nodeType="mainSeq">`;
  xml += "<p:childTnLst>";

  shapeIds.forEach((spid, idx) => {
    xml += "<p:par>";
    xml += `<p:cTn id="${baseId + 2 + idx}" fill="hold" nodeType="clickEffect">`;
    xml += '<p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>';
    xml += "<p:childTnLst>";
    xml += '<p:animEffect transition="in" filter="fade">';
    xml += "<p:cBhvr>";
    xml += `<p:cTn id="${baseId + 100000 + idx}" dur="500" fill="hold">`;
    xml += '<p:stCondLst><p:cond delay="0"/></p:stCondLst>';
    xml += "</p:cTn>";
    xml += `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`;
    xml += "</p:cBhvr>";
    xml += "</p:animEffect>";
    xml += "</p:childTnLst>";
    xml += "</p:cTn>";
    xml += "</p:par>";
  });

  xml +=
    "</p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>";
  return xml;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

interface SlideAnimInfo {
  transition: "fade" | "push";
  elementCount: number;
}

function getMasterNameForLayout(layout: string): string | undefined {
  switch (layout) {
    case "title":
      return "MASTER_TITLE";
    case "title-content":
      return "MASTER_TITLE_CONTENT";
    case "title-only":
      return "MASTER_TITLE_ONLY";
    case "content-only":
      return "MASTER_CONTENT_ONLY";
    case "two-column":
      return "MASTER_TWO_COLUMN";
    case "image-left":
      return "MASTER_IMAGE_LEFT";
    case "image-right":
      return "MASTER_IMAGE_RIGHT";
    case "timeline":
    case "gantt":
      return "MASTER_CHART";
    default:
      return undefined;
  }
}

function addGanttChartToSlide(
  slide: any,
  pptx: PptxGenJS,
  tasks: GanttTask[],
  x: number | string,
  y: number | string,
  w: number | string,
  h: number | string,
  colors: { bg: string; accent: string; fg: string; bodyFont: string }
) {
  if (tasks.length === 0) return;
  const { min, max } = getDateRange(tasks);
  const minTime = min.getTime();
  const offsetDays = tasks.map((t) =>
    Math.round((new Date(t.startDate).getTime() - minTime) / (1000 * 60 * 60 * 24))
  );
  const durationDays = tasks.map((t) =>
    Math.max(
      1,
      Math.round((new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / (1000 * 60 * 60 * 24))
    )
  );
  slide.addChart(
    pptx.ChartType.bar,
    [
      { name: "Offset", labels: tasks.map((t) => t.name), values: offsetDays },
      { name: "Duration", labels: tasks.map((t) => t.name), values: durationDays },
    ],
    {
      x,
      y,
      w,
      h,
      barDir: "bar",
      barGrouping: "stacked",
      chartColors: [stripHash(colors.bg), stripHash(colors.accent)],
      showValue: false,
      showLabel: false,
      catAxisHidden: false,
      valAxisHidden: true,
      catGridLine: { style: "none" },
      valGridLine: { style: "none" },
      catAxisLabelFontSize: 9,
      catAxisLabelColor: stripHash(colors.fg),
    }
  );
}

function addGanttBarsToSlide(
  slide: any,
  pptx: PptxGenJS,
  tasks: GanttTask[],
  x: number | string,
  y: number | string,
  w: number | string,
  h: number | string,
  colors: { bg: string; accent: string; fg: string; muted?: string },
  backgroundColor?: string
) {
  if (tasks.length === 0) return;
  const { min, max } = getDateRange(tasks);
  const effectiveScale = resolveTimeScale(min, max, "auto");
  const markers = generateScaleMarkers(min, max, effectiveScale);

  // Parse percentages
  const xPct = typeof x === "string" && x.includes("%") ? parseFloat(x) : (typeof x === "string" ? (parseFloat(x) / 10) * 100 : (typeof x === "number" ? (x / 10) * 100 : 0));
  const yPct = typeof y === "string" && y.includes("%") ? parseFloat(y) : (typeof y === "string" ? (parseFloat(y) / 5.625) * 100 : (typeof y === "number" ? (y / 5.625) * 100 : 0));
  const wPct = typeof w === "string" && w.includes("%") ? parseFloat(w) : (typeof w === "string" ? (parseFloat(w) / 10) * 100 : (typeof w === "number" ? (w / 10) * 100 : 100));
  const hPct = typeof h === "string" && h.includes("%") ? parseFloat(h) : (typeof h === "string" ? (parseFloat(h) / 5.625) * 100 : (typeof h === "number" ? (h / 5.625) * 100 : 100));

  const labelWPct = wPct * 0.22;
  const barAreaWPct = wPct * 0.73;
  const paddingXPct = wPct * 0.025;
  const paddingYPct = hPct * 0.05;
  const headerHPct = hPct * 0.18;
  const taskHPct = (hPct - paddingYPct * 2 - headerHPct) / tasks.length;

  const headerY = yPct + paddingYPct;
  const barStartX = xPct + labelWPct + paddingXPct;

  // Background shape (element background)
  if (backgroundColor && backgroundColor !== "transparent") {
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w, h,
      fill: { color: stripHash(backgroundColor) },
      line: { color: "00000000", width: 0 },
    });
  }

  // Header background (muted)
  if (colors.muted && colors.muted !== "transparent") {
    slide.addShape(pptx.ShapeType.rect, {
      x: `${xPct}%`,
      y: `${headerY}%`,
      w: `${wPct}%`,
      h: `${headerHPct}%`,
      fill: { color: stripHash(colors.muted) },
      line: { color: "00000000", width: 0 },
    });
  }

  // Scale header line at bottom of header
  slide.addShape(pptx.ShapeType.line, {
    x: `${barStartX}%`,
    y: `${headerY + headerHPct}%`,
    w: `${barAreaWPct}%`,
    h: 0,
    line: { color: colors.fg ? stripHash(colors.fg) : "FFFFFF", width: 1 },
  });

  // Scale markers (S1, S2, etc.) — only show markers within the visible range
  markers
    .filter((m) => m.position >= 0 && m.position <= 1)
    .forEach((m) => {
      const markerX = barStartX + m.position * barAreaWPct;
      slide.addText(m.label, {
        x: `${markerX - barAreaWPct * 0.03}%`,
        y: `${headerY + headerHPct * 0.1}%`,
        w: `${barAreaWPct * 0.06}%`,
        h: `${headerHPct * 0.75}%`,
        fontSize: m.isMajor ? 8 : 7,
        bold: m.isMajor,
        color: colors.fg ? stripHash(colors.fg) : "FFFFFF",
        align: "center",
        valign: "bottom",
      });
    });

  // Grid lines between tasks (skip line between header and first task)
  for (let i = 1; i < tasks.length; i++) {
    const gridY = headerY + headerHPct + i * taskHPct;
    slide.addShape(pptx.ShapeType.line, {
      x: `${xPct + paddingXPct}%`,
      y: `${gridY}%`,
      w: `${wPct - paddingXPct * 2}%`,
      h: 0,
      line: { color: "FFFFFF", width: 0.5, transparency: 80 },
    });
  }

  // Task bars
  tasks.forEach((task, i) => {
    const pos = getTaskPosition(task, min, max);
    const taskY = headerY + headerHPct + i * taskHPct;
    const labelX = xPct + paddingXPct;
    const barOffsetPct = (pos.left / 100) * barAreaWPct;
    const barWidthPct = Math.max((pos.width / 100) * barAreaWPct, 0.3);

    // Task label
    slide.addText(task.name, {
      x: `${labelX}%`,
      y: `${taskY}%`,
      w: `${labelWPct - paddingXPct}%`,
      h: `${taskHPct}%`,
      fontSize: 9,
      color: colors.fg ? stripHash(colors.fg) : "FFFFFF",
      valign: "middle",
      align: "left",
    });

    // Bar rectangle
    slide.addShape(pptx.ShapeType.roundRect, {
      x: `${barStartX + barOffsetPct}%`,
      y: `${taskY + taskHPct * 0.25}%`,
      w: `${barWidthPct}%`,
      h: `${taskHPct * 0.5}%`,
      fill: { color: task.color ? stripHash(task.color) : "3B82F6" },
      line: { color: "FFFFFF", width: 0.5 },
      rectRadius: 0.15,
    });
  });
}

function addTimelineChartToSlide(
  slide: any,
  pptx: PptxGenJS,
  events: TimelineEvent[],
  x: number | string,
  y: number | string,
  w: number | string,
  h: number | string,
  colors: { accent: string; fg: string; secondary: string }
) {
  if (events.length === 0) return;
  const { min, max } = getTimelineDateRange(events);
  const minTime = min.getTime();
  const maxTime = max.getTime();
  const totalDays = Math.max(1, (maxTime - minTime) / (1000 * 60 * 60 * 24));
  const xValues = events.map((e) =>
    Math.round((new Date(e.date).getTime() - minTime) / (1000 * 60 * 60 * 24))
  );
  const yValues = events.map((_, i) => (i % 2 === 0 ? 1 : 2));

  slide.addChart(
    pptx.ChartType.scatter,
    [
      { name: "Timeline X", values: xValues },
      { name: "Events", values: yValues },
    ],
    {
      x,
      y,
      w,
      h,
      showValue: false,
      showLabel: false,
      lineDataSymbol: "circle",
      lineDataSymbolSize: 10,
      chartColors: [stripHash(colors.accent)],
      catAxisHidden: false,
      valAxisHidden: true,
      catAxisMaxVal: Math.ceil(totalDays * 1.05),
      catAxisMinVal: 0,
      catGridLine: { style: "none" },
      valGridLine: { style: "none" },
      catAxisLabelFontSize: 9,
      catAxisLabelColor: stripHash(colors.secondary),
    }
  );
}

export async function exportToPPTX(
  presentation: Presentation,
  template?: Template
): Promise<void> {
  const pptx = new PptxGenJS();

  // Set metadata
  pptx.title = presentation.title;
  pptx.subject = presentation.subtitle || "";
  pptx.author = presentation.author || "MyBeautifulPresentation";
  pptx.company = "MyBeautifulPresentation";

  // Set layout
  pptx.layout = "LAYOUT_16x9";

  const bgColor = stripHash(template?.colors.background || "FFFFFF");
  const fgColor = stripHash(template?.colors.foreground || "000000");
  const accentColor = stripHash(template?.colors.accent || "1e40af");
  const secondaryColor = stripHash(template?.colors.secondary || "666666");
  const mutedColor = stripHash(template?.colors.muted || "F1F5F9");
  const headingFont = extractFirstFont(template?.fonts.heading || "Arial");
  const bodyFont = extractFirstFont(template?.fonts.body || "Arial");

  // Define master slides when template is provided — decorative elements ONLY, no text placeholders
  if (template) {
    // MASTER_TITLE
    pptx.defineSlideMaster({
      title: "MASTER_TITLE",
      background: { color: bgColor },
      objects: [
        {
          rect: {
            x: 0,
            y: 0,
            w: "100%",
            h: 0.08,
            fill: { color: accentColor },
          },
        },
        {
          rect: {
            x: "45%",
            y: "92%",
            w: "10%",
            h: 0.04,
            fill: { color: accentColor },
          },
        },
      ],
    });

    // MASTER_TITLE_CONTENT
    pptx.defineSlideMaster({
      title: "MASTER_TITLE_CONTENT",
      background: { color: bgColor },
      objects: [
        {
          rect: {
            x: 0.5,
            y: 1.05,
            w: 0.5,
            h: 0.03,
            fill: { color: accentColor, transparency: 40 },
          },
        },
      ],
    });

    // MASTER_TITLE_ONLY
    pptx.defineSlideMaster({
      title: "MASTER_TITLE_ONLY",
      background: { color: bgColor },
      objects: [
        {
          rect: {
            x: 0,
            y: "15%",
            w: 0.06,
            h: "70%",
            fill: { color: accentColor },
          },
        },
      ],
    });

    // MASTER_CONTENT_ONLY
    pptx.defineSlideMaster({
      title: "MASTER_CONTENT_ONLY",
      background: { color: bgColor },
      objects: [
        {
          rect: {
            x: "8%",
            y: "8%",
            w: "84%",
            h: 0.03,
            fill: { color: accentColor, transparency: 60 },
          },
        },
      ],
    });

    // MASTER_TWO_COLUMN
    pptx.defineSlideMaster({
      title: "MASTER_TWO_COLUMN",
      background: { color: bgColor },
      objects: [
        {
          rect: {
            x: 0.5,
            y: 1.05,
            w: 0.6,
            h: 0.03,
            fill: { color: accentColor, transparency: 40 },
          },
        },
        {
          rect: {
            x: "49.5%",
            y: "15%",
            w: 0.01,
            h: "70%",
            fill: {
              color: template?.colors.border
                ? stripHash(template.colors.border)
                : "CCCCCC",
            },
          },
        },
      ],
    });

    // MASTER_IMAGE_LEFT
    pptx.defineSlideMaster({
      title: "MASTER_IMAGE_LEFT",
      background: { color: bgColor },
      objects: [
        {
          rect: {
            x: 0,
            y: 0,
            w: "40%",
            h: "100%",
            fill: { color: mutedColor },
          },
        },
      ],
    });

    // MASTER_IMAGE_RIGHT
    pptx.defineSlideMaster({
      title: "MASTER_IMAGE_RIGHT",
      background: { color: bgColor },
      objects: [
        {
          rect: {
            x: "60%",
            y: 0,
            w: "40%",
            h: "100%",
            fill: { color: mutedColor },
          },
        },
      ],
    });

    // MASTER_CHART for timeline/gantt
    pptx.defineSlideMaster({
      title: "MASTER_CHART",
      background: { color: bgColor },
      objects: [
        {
          rect: {
            x: 0.5,
            y: 0.9,
            w: 0.5,
            h: 0.03,
            fill: { color: accentColor, transparency: 40 },
          },
        },
      ],
    });
  }

  const slideAnimInfos: SlideAnimInfo[] = [];

  // Pre-render Mermaid diagrams to SVG
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "strict",
  });

  const mermaidSvgs = new Map<string, string>();
  const mermaidElements: Array<{ id: string; code: string }> = [];
  presentation.slides.forEach((slide) => {
    slide.elements?.forEach((el) => {
      if (el.type === "diagram" && (el.subtype || "mermaid") === "mermaid" && el.content) {
        mermaidElements.push({ id: `${slide.id}-${el.id || el.type}`, code: el.content });
      }
    });
  });

  if (mermaidElements.length > 0) {
    await Promise.all(
      mermaidElements.map(async ({ id, code }) => {
        try {
          const svg = await mermaid.render(`mermaid-export-${id}`, code.trim());
          mermaidSvgs.set(id, svg.svg);
        } catch {
          // Silently fail — fallback to text will be used
        }
      })
    );
  }

  // Create slides
  for (const [slideIdx, slide] of presentation.slides.entries()) {
    const hasElements = slide.elements && slide.elements.length > 0;
    const masterName = template && !hasElements
      ? getMasterNameForLayout(slide.layout)
      : undefined;
    const s = masterName
      ? pptx.addSlide({ masterName })
      : pptx.addSlide();

    // Apply background from template
    s.background = { color: bgColor };

    // Logo de charte — doit apparaître sur CHAQUE slide exportée, sinon le
    // client reçoit une présentation sans sa marque. Position et taille suivent
    // celles du template (en % de la slide, jamais en pixels).
    if (template?.logo?.url) {
      const box = logoBoxFor(template.logo, slide.layout);
      if (box) {
        try {
          s.addImage({
            data: template.logo.url,
            x: box.x,
            y: box.y,
            w: box.w,
            h: box.h,
          });
        } catch {
          // Un logo illisible (data URL corrompue, format non supporté) ne doit
          // jamais faire échouer tout l'export : la présentation reste valide.
        }
      }
    }

    // Add notes if present
    if (slide.notes) {
      s.addNotes(slide.notes);
    }

    let elementCount = 0;

    if (hasElements) {
      // Export canvas elements directly
      for (const element of slide.elements!) {
        if (element.type === "text") {
          s.addText(element.content || "", {
            x: `${element.x}%`,
            y: `${element.y}%`,
            w: `${element.w}%`,
            h: `${element.h}%`,
            fontSize: element.style?.fontSize,
            bold: element.style?.fontWeight === "bold" || element.style?.fontWeight === 700,
            color: element.style?.color ? stripHash(element.style.color) : fgColor,
            align: element.style?.textAlign,
            fontFace: extractFirstFont(element.style?.fontFamily || bodyFont),
          });
          elementCount++;
        } else if (element.type === "image") {
          s.addImage({
            data: element.content || "",
            x: `${element.x}%`,
            y: `${element.y}%`,
            w: `${element.w}%`,
            h: `${element.h}%`,
          });
          elementCount++;
        } else if (element.type === "shape") {
          elementCount++;
        } else if (element.type === "table") {
          elementCount++;
        } else if (element.type === "chronology") {
          const data = (() => { try { return JSON.parse(element.content || "{}") || {}; } catch { return {}; } })();
          const rows = data.rows || [];
          const chronType = element.subtype || data.type || "gantt";
          if (rows.length > 0) {
            if (chronType === "gantt") {
              if (template) {
                // Calculate capture dimensions to match element aspect ratio
                const slideW = 10; // inches for 16:9
                const slideH = 5.625;
                const elWPct = element.w / 100;
                const elHPct = element.h / 100;
                const elRatio = (elWPct * slideW) / (elHPct * slideH);
                const captureWidth = 640;
                const captureHeight = Math.round(captureWidth / elRatio);
                const imgData = await captureGanttChart(rows, template.colors, template.fonts, element.style?.backgroundColor, {
                  width: captureWidth,
                  height: captureHeight,
                  pixelRatio: 2,
                });
                if (imgData) {
                  s.addImage({ data: imgData, x: `${element.x}%`, y: `${element.y}%`, w: `${element.w}%`, h: `${element.h}%` });
                }
              } else {
                const content = rows
                  .map((r: any) => {
                    const end = addDays(r.start, parseDurationDays(r.duration));
                    return `${r.task} | ${r.start} | ${end}${r.color ? ` | ${r.color}` : ""}`;
                  })
                  .join("\n");
                const tasks = parseGanttContent(content);
                const elBg = element.style?.backgroundColor;
                addGanttBarsToSlide(s, pptx, tasks, `${element.x}%`, `${element.y}%`, `${element.w}%`, `${element.h}%`, {
                  bg: bgColor,
                  accent: accentColor,
                  fg: fgColor,
                  muted: mutedColor,
                }, elBg);
              }
              elementCount++;
            } else if (chronType === "timeline") {
              const events = rows.map((r: any) => ({ id: r.id?.toString() || r.task, date: r.start, title: r.task, color: r.color }));
              addTimelineChartToSlide(s, pptx, events, `${element.x}%`, `${element.y}%`, `${element.w}%`, `${element.h}%`, {
                accent: accentColor,
                fg: fgColor,
                secondary: secondaryColor,
              });
              elementCount++;
            }
          }
        } else if (element.type === "diagram") {
          const code = element.content || "";
          const diagramType = element.subtype || "mermaid";
          const svgKey = `${slide.id}-${element.id || element.type}`;
          const svg = diagramType === "mermaid" ? mermaidSvgs.get(svgKey) : undefined;
          if (svg) {
            s.addImage({
              data: `data:image/svg+xml;base64,${svgToBase64(svg)}`,
              x: `${element.x}%`,
              y: `${element.y}%`,
              w: `${element.w}%`,
              h: `${element.h}%`,
            });
          } else {
            s.addText(`${diagramType.toUpperCase()} Diagram:\n${code}`, {
              x: `${element.x}%`,
              y: `${element.y}%`,
              w: `${element.w}%`,
              h: `${element.h}%`,
              fontSize: 10,
              color: fgColor,
              fontFace: bodyFont,
              valign: "top",
            });
          }
          elementCount++;
        } else if (element.type === "powerbi") {
          const config = (() => {
            try {
              return JSON.parse(element.content || "{}") as PowerBiConfig;
            } catch {
              return { title: "Rapport Power BI", embedUrl: "" } as PowerBiConfig;
            }
          })();
          let screenshotUrl: string | null = null;
          if (config.embedUrl) {
            try {
              const response = await fetch("/api/powerbi/screenshot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url: config.embedUrl,
                  width: 1280,
                  height: 720,
                }),
              });
              if (response.ok) {
                const data = await response.json();
                if (data.image) screenshotUrl = data.image;
              }
            } catch {
              // Fallback to placeholder on API failure
            }
          }
          if (screenshotUrl) {
            s.addImage({
              data: screenshotUrl,
              x: `${element.x}%`,
              y: `${element.y}%`,
              w: `${element.w}%`,
              h: `${element.h}%`,
            });
          } else {
            // Placeholder: gray box with title and URL
            s.addShape(pptx.ShapeType.rect, {
              x: `${element.x}%`,
              y: `${element.y}%`,
              w: `${element.w}%`,
              h: `${element.h}%`,
              fill: { color: "F3F4F6" },
              line: { color: "D1D5DB", width: 1 },
            });
            s.addText(`📊 ${config.title}\n${config.embedUrl}`, {
              x: `${element.x}%`,
              y: `${element.y}%`,
              w: `${element.w}%`,
              h: `${element.h}%`,
              fontSize: 10,
              color: fgColor,
              fontFace: bodyFont,
              align: "center",
              valign: "middle",
            });
          }
          elementCount++;
        }
      }
    } else {
      // Add content based on layout
      switch (slide.layout) {
      case "title": {
        s.addText(slide.title, {
          x: 0.5,
          y: 2.3,
          w: "90%",
          h: 1.2,
          fontSize: 40,
          bold: true,
          color: fgColor,
          align: "center",
          fontFace: headingFont,
        });
        elementCount++;

        if (slide.content) {
          s.addText(slide.content, {
            x: 0.5,
            y: 3.7,
            w: "90%",
            h: 1.2,
            fontSize: 20,
            color: secondaryColor,
            align: "center",
            fontFace: bodyFont,
          });
          elementCount++;
        }
        break;
      }

      case "title-only": {
        s.addText(slide.title, {
          x: 0.5,
          y: "35%",
          w: "88%",
          h: 1.5,
          fontSize: 44,
          bold: true,
          color: fgColor,
          fontFace: headingFont,
        });
        elementCount++;
        break;
      }

      case "content-only": {
        s.addText(slide.content, {
          x: 0.5,
          y: "12%",
          w: "90%",
          h: "80%",
          fontSize: 18,
          color: fgColor,
          fontFace: bodyFont,
          valign: "top",
        });
        elementCount++;
        break;
      }

      case "two-column": {
        // Split on FIRST pipe only to preserve content containing pipes
        const pipeIndex = slide.content.indexOf("|");
        const leftContent =
          pipeIndex >= 0
            ? slide.content.slice(0, pipeIndex).trim()
            : slide.content;
        const rightContent =
          pipeIndex >= 0 ? slide.content.slice(pipeIndex + 1).trim() : "";

        s.addText(slide.title, {
          x: 0.5,
          y: 0.3,
          w: "90%",
          h: 0.8,
          fontSize: 32,
          bold: true,
          color: fgColor,
          fontFace: headingFont,
        });
        elementCount++;

        s.addText(leftContent, {
          x: 0.5,
          y: 1.3,
          w: "44%",
          h: "75%",
          fontSize: 16,
          color: fgColor,
          fontFace: bodyFont,
          valign: "top",
        });
        elementCount++;

        s.addText(rightContent, {
          x: "51%",
          y: 1.3,
          w: "44%",
          h: "75%",
          fontSize: 16,
          color: fgColor,
          fontFace: bodyFont,
          valign: "top",
        });
        elementCount++;
        break;
      }

      case "image-left": {
        s.addText(slide.title, {
          x: "44%",
          y: "25%",
          w: "52%",
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: fgColor,
          fontFace: headingFont,
        });
        elementCount++;

        s.addText(slide.content, {
          x: "44%",
          y: "38%",
          w: "52%",
          h: "55%",
          fontSize: 16,
          color: fgColor,
          fontFace: bodyFont,
          valign: "top",
        });
        elementCount++;
        break;
      }

      case "image-right": {
        s.addText(slide.title, {
          x: "4%",
          y: "25%",
          w: "52%",
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: fgColor,
          fontFace: headingFont,
        });
        elementCount++;

        s.addText(slide.content, {
          x: "4%",
          y: "38%",
          w: "52%",
          h: "55%",
          fontSize: 16,
          color: fgColor,
          fontFace: bodyFont,
          valign: "top",
        });
        elementCount++;
        break;
      }

      case "timeline": {
        const events =
          slide.data?.timeline?.events ?? parseTimelineContent(slide.content);

        s.addText(slide.title, {
          x: 0.5,
          y: 0.3,
          w: "90%",
          h: 0.6,
          fontSize: 28,
          bold: true,
          color: fgColor,
          fontFace: headingFont,
        });
        elementCount++;

        addTimelineChartToSlide(s, pptx, events, 0.5, 1.4, "90%", "55%", {
          accent: accentColor,
          fg: fgColor,
          secondary: secondaryColor,
        });
        if (events.length > 0) elementCount++;
        break;
      }

      case "gantt": {
        const tasks =
          slide.data?.gantt?.tasks ?? parseGanttContent(slide.content);

        s.addText(slide.title, {
          x: 0.5,
          y: 0.3,
          w: "90%",
          h: 0.6,
          fontSize: 28,
          bold: true,
          color: fgColor,
          fontFace: headingFont,
        });
        elementCount++;

        addGanttChartToSlide(s, pptx, tasks, 0.5, 1.4, "90%", "55%", {
          bg: bgColor,
          accent: accentColor,
          fg: fgColor,
          bodyFont,
        });
        if (tasks.length > 0) elementCount++;
        break;
      }

      default: {
        // title-content
        s.addText(slide.title, {
          x: 0.5,
          y: 0.3,
          w: "90%",
          h: 0.8,
          fontSize: 32,
          bold: true,
          color: fgColor,
          fontFace: headingFont,
        });
        elementCount++;

        s.addText(slide.content, {
          x: 0.5,
          y: 1.3,
          w: "90%",
          h: "78%",
          fontSize: 18,
          color: fgColor,
          fontFace: bodyFont,
          valign: "top",
        });
        elementCount++;
        break;
      }
    }
    }

    // Add images from slide data if present
    const slideImages = (slide.data as Record<string, unknown> | undefined)
      ?.images as string[] | undefined;
    if (slideImages && slideImages.length > 0) {
      slideImages.forEach((imgData) => {
        if (slide.layout === "image-left") {
          s.addImage({
            data: imgData,
            x: "5%",
            y: "25%",
            w: "30%",
            h: "50%",
          });
        } else if (slide.layout === "image-right") {
          s.addImage({
            data: imgData,
            x: "65%",
            y: "25%",
            w: "30%",
            h: "50%",
          });
        } else {
          s.addImage({
            data: imgData,
            x: "25%",
            y: "30%",
            w: "50%",
            h: "40%",
          });
        }
        elementCount++;
      });
    }

    slideAnimInfos.push({
      transition: slideIdx % 2 === 0 ? "fade" : "push",
      elementCount,
    });
  }

  const safeFileName =
    (presentation.title || "presentation")
      .replace(/[^\p{L}\p{N}\s\-_]/gu, "")
      .replace(/\s+/g, "_") || "presentation";

  // Generate PPTX as arraybuffer, post-process animations, then download
  const arrayBuffer = await pptx.write({ outputType: "arraybuffer" });
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Inject animations into each slide
  for (let i = 0; i < presentation.slides.length; i++) {
    const slidePath = `ppt/slides/slide${i + 1}.xml`;
    const slideXml = await zip.file(slidePath)?.async("text");
    if (!slideXml) continue;

    const animInfo = slideAnimInfos[i];
    let extraXml = generateTransitionXml(animInfo.transition);
    if (animInfo.elementCount > 0) {
      const shapeIds = Array.from(
        { length: animInfo.elementCount },
        (_, j) => j + 2
      );
      extraXml += generateTimingXml(shapeIds, i);
    }
    const newSlideXml = slideXml.replace("</p:sld>", `${extraXml}</p:sld>`);
    zip.file(slidePath, newSlideXml);
  }

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });

  downloadBlob(blob, `${safeFileName}.pptx`);
}
