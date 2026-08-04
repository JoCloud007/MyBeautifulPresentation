import PptxGenJS from "pptxgenjs";
import { Presentation } from "@/app/types/presentation";
import { Template } from "@/app/types/template";
import {
  parseGanttContent,
  parseTimelineContent,
  getDateRange,
  getTimelineDateRange,
  getTaskPosition,
  getEventPosition,
  detectTimeScale,
  generateScaleMarkers,
} from "@/lib/ganttParser";

function stripHash(color: string): string {
  return color.startsWith("#") ? color.slice(1) : color;
}

function extractFirstFont(fontStack: string): string {
  return fontStack.split(",")[0].trim();
}

export function exportToPPTX(
  presentation: Presentation,
  template?: Template
): void {
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

  // Apply template colors if available
  if (template) {
    pptx.defineSlideMaster({
      title: "MASTER_SLIDE",
      background: { color: bgColor },
      objects: [],
    });
  }

  // Create slides
  presentation.slides.forEach((slide) => {
    const s = template
      ? pptx.addSlide({ masterName: "MASTER_SLIDE" })
      : pptx.addSlide();

    // Apply background
    s.background = { color: bgColor };

    // Add notes if present
    if (slide.notes) {
      s.addNotes(slide.notes);
    }

    // Add content based on layout
    switch (slide.layout) {
      case "title": {
        // Top accent bar
        s.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: "100%",
          h: 0.08,
          fill: { color: accentColor },
        });

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
        }

        // Bottom accent line
        s.addShape(pptx.ShapeType.rect, {
          x: "45%",
          y: "92%",
          w: "10%",
          h: 0.04,
          fill: { color: accentColor },
        });
        break;
      }

      case "title-only": {
        // Left accent bar
        s.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: "15%",
          w: 0.06,
          h: "70%",
          fill: { color: accentColor },
        });

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
        break;
      }

      case "content-only": {
        // Top accent divider
        s.addShape(pptx.ShapeType.rect, {
          x: "8%",
          y: "8%",
          w: "84%",
          h: 0.03,
          fill: { color: accentColor, transparency: 60 },
        });

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
        break;
      }

      case "two-column": {
        // Split on FIRST pipe only to preserve content containing pipes
        const pipeIndex = slide.content.indexOf("|");
        const leftContent = pipeIndex >= 0 ? slide.content.slice(0, pipeIndex).trim() : slide.content;
        const rightContent = pipeIndex >= 0 ? slide.content.slice(pipeIndex + 1).trim() : "";

        // Title
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

        // Accent underline
        s.addShape(pptx.ShapeType.rect, {
          x: 0.5,
          y: 1.05,
          w: 0.6,
          h: 0.03,
          fill: { color: accentColor, transparency: 40 },
        });

        // Left column
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

        // Vertical divider
        s.addShape(pptx.ShapeType.rect, {
          x: "49.5%",
          y: "15%",
          w: 0.01,
          h: "70%",
          fill: { color: template?.colors.border ? stripHash(template.colors.border) : "CCCCCC" },
        });

        // Right column
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
        break;
      }

      case "image-left": {
        // Image placeholder panel
        s.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: "40%",
          h: "100%",
          fill: { color: mutedColor },
        });

        // Placeholder icon text
        s.addText("Image", {
          x: "5%",
          y: "45%",
          w: "30%",
          h: 0.5,
          fontSize: 14,
          color: secondaryColor,
          align: "center",
          fontFace: bodyFont,
        });

        // Text side
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
        break;
      }

      case "image-right": {
        // Text side
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

        // Image placeholder panel
        s.addShape(pptx.ShapeType.rect, {
          x: "60%",
          y: 0,
          w: "40%",
          h: "100%",
          fill: { color: mutedColor },
        });

        s.addText("Image", {
          x: "65%",
          y: "45%",
          w: "30%",
          h: 0.5,
          fontSize: 14,
          color: secondaryColor,
          align: "center",
          fontFace: bodyFont,
        });
        break;
      }

      case "timeline": {
        const events = slide.data?.timeline?.events ?? parseTimelineContent(slide.content);

        // Title
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

        // Accent underline
        s.addShape(pptx.ShapeType.rect, {
          x: 0.5,
          y: 0.9,
          w: 0.5,
          h: 0.03,
          fill: { color: accentColor, transparency: 40 },
        });

        if (events.length === 0) {
          s.addText("Aucun événement", {
            x: 0.5,
            y: "45%",
            w: "90%",
            h: 0.5,
            fontSize: 14,
            color: secondaryColor,
            align: "center",
            fontFace: bodyFont,
          });
          break;
        }

        const { min, max } = getTimelineDateRange(events);
        const scale = detectTimeScale(min, max);
        const markers = generateScaleMarkers(min, max, scale);
        const labelInterval = Math.max(1, Math.ceil(markers.length / 10));

        // Timeline horizontal line
        s.addShape(pptx.ShapeType.rect, {
          x: "8%",
          y: "52%",
          w: "84%",
          h: 0.04,
          fill: { color: secondaryColor, transparency: 60 },
        });

        // Scale markers
        markers.forEach((marker, i) => {
          const xPos = 8 + marker.position * 84;
          if (i % labelInterval === 0 || marker.isMajor) {
            s.addText(marker.label, {
              x: `${xPos - 5}%`,
              y: "56%",
              w: "10%",
              h: 0.25,
              fontSize: 8,
              color: secondaryColor,
              align: "center",
              fontFace: bodyFont,
            });
          }
          if (marker.isMajor) {
            s.addShape(pptx.ShapeType.rect, {
              x: `${xPos}%`,
              y: "51%",
              w: 0.01,
              h: 0.1,
              fill: { color: secondaryColor, transparency: 70 },
            });
          }
        });

        // Event nodes and labels
        events.forEach((evt, i) => {
          const pos = getEventPosition(evt, min, max);
          const xPos = 8 + (pos / 100) * 84;
          const isAbove = i % 2 === 0;
          const eventColor = evt.color ? stripHash(evt.color) : accentColor;

          // Node circle
          s.addShape(pptx.ShapeType.ellipse, {
            x: `${xPos - 1}%`,
            y: "50.5%",
            w: 0.2,
            h: 0.2,
            fill: { color: eventColor },
          });

          // Date
          s.addText(evt.date, {
            x: `${xPos - 8}%`,
            y: isAbove ? "36%" : "58%",
            w: "16%",
            h: 0.25,
            fontSize: 9,
            bold: true,
            color: eventColor,
            align: "center",
            fontFace: bodyFont,
          });

          // Title
          s.addText(evt.title, {
            x: `${xPos - 8}%`,
            y: isAbove ? "40%" : "62%",
            w: "16%",
            h: 0.35,
            fontSize: 9,
            color: fgColor,
            align: "center",
            fontFace: bodyFont,
          });

          // Description
          if (evt.description) {
            s.addText(evt.description, {
              x: `${xPos - 8}%`,
              y: isAbove ? "44%" : "66%",
              w: "16%",
              h: 0.35,
              fontSize: 8,
              color: secondaryColor,
              align: "center",
              fontFace: bodyFont,
            });
          }
        });
        break;
      }

      case "gantt": {
        const tasks = slide.data?.gantt?.tasks ?? parseGanttContent(slide.content);

        // Title
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

        // Accent underline
        s.addShape(pptx.ShapeType.rect, {
          x: 0.5,
          y: 0.9,
          w: 0.5,
          h: 0.03,
          fill: { color: accentColor, transparency: 40 },
        });

        if (tasks.length === 0) {
          s.addText("Aucune tâche", {
            x: 0.5,
            y: "45%",
            w: "90%",
            h: 0.5,
            fontSize: 14,
            color: secondaryColor,
            align: "center",
            fontFace: bodyFont,
          });
          break;
        }

        const { min, max } = getDateRange(tasks);
        const scale = detectTimeScale(min, max);
        const markers = generateScaleMarkers(min, max, scale);
        const labelInterval = Math.max(1, Math.ceil(markers.length / 12));

        const chartLeftPct = 30;
        const chartWidthPct = 65;

        // Header row
        s.addText("Tâche", {
          x: 0.5,
          y: 1.3,
          w: "25%",
          h: 0.3,
          fontSize: 11,
          bold: true,
          color: secondaryColor,
          fontFace: headingFont,
        });

        // Time axis line
        s.addShape(pptx.ShapeType.rect, {
          x: `${chartLeftPct}%`,
          y: 1.6,
          w: `${chartWidthPct}%`,
          h: 0.02,
          fill: { color: secondaryColor, transparency: 60 },
        });

        // Scale markers and grid lines
        markers.forEach((marker, i) => {
          const xPos = chartLeftPct + marker.position * chartWidthPct;
          if (i % labelInterval === 0 || marker.isMajor) {
            s.addText(marker.label, {
              x: `${xPos - 3}%`,
              y: 1.3,
              w: "6%",
              h: 0.25,
              fontSize: 8,
              color: secondaryColor,
              align: "center",
              fontFace: bodyFont,
            });
          }
          if (marker.isMajor) {
            s.addShape(pptx.ShapeType.rect, {
              x: `${xPos}%`,
              y: 1.6,
              w: 0.01,
              h: tasks.length * 0.5 + 0.3,
              fill: { color: secondaryColor, transparency: 70 },
            });
          }
        });

        // Task rows
        tasks.forEach((task, i) => {
          const yPos = 1.9 + i * 0.5;
          const pos = getTaskPosition(task, min, max);
          const barLeft = chartLeftPct + (pos.left / 100) * chartWidthPct;
          const barWidth = (pos.width / 100) * chartWidthPct;
          const taskColor = task.color ? stripHash(task.color) : accentColor;

          s.addText(task.name, {
            x: 0.5,
            y: yPos,
            w: "25%",
            h: 0.35,
            fontSize: 10,
            color: fgColor,
            fontFace: bodyFont,
          });

          s.addShape(pptx.ShapeType.rect, {
            x: `${barLeft}%`,
            y: yPos + 0.05,
            w: `${Math.max(barWidth, 0.5)}%`,
            h: 0.25,
            fill: { color: taskColor },
          });
        });
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

        // Accent underline
        s.addShape(pptx.ShapeType.rect, {
          x: 0.5,
          y: 1.05,
          w: 0.5,
          h: 0.03,
          fill: { color: accentColor, transparency: 40 },
        });

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
        break;
      }
    }
  });

  const safeFileName = (presentation.title || "presentation")
    // Keep letters, digits, spaces, dashes, underscores, and common non-ASCII chars (French, etc.)
    .replace(/[^\p{L}\p{N}\s\-_]/gu, "")
    .replace(/\s+/g, "_")
    || "presentation";

  pptx.writeFile({ fileName: `${safeFileName}.pptx` });
}
