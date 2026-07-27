import PptxGenJS from "pptxgenjs";
import { Presentation } from "@/app/types/presentation";
import { Template } from "@/app/types/template";

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
        const events = slide.content
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const total = events.length || 1;

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

        // Timeline horizontal line
        s.addShape(pptx.ShapeType.rect, {
          x: "8%",
          y: "52%",
          w: "84%",
          h: 0.04,
          fill: { color: secondaryColor, transparency: 60 },
        });

        // Active segment
        if (total > 1) {
          s.addShape(pptx.ShapeType.rect, {
            x: "8%",
            y: "52%",
            w: `${((total - 1) / total) * 84}%`,
            h: 0.04,
            fill: { color: accentColor },
          });
        }

        // Event nodes and labels
        events.forEach((evt, i) => {
          const sep = evt.indexOf(" - ");
          const date = sep >= 0 ? evt.slice(0, sep).trim() : "";
          const desc = sep >= 0 ? evt.slice(sep + 3).trim() : evt;
          const isAbove = i % 2 === 0;
          const xPos = 8 + (i / Math.max(total - 1, 1)) * 84;

          // Node circle
          s.addShape(pptx.ShapeType.ellipse, {
            x: `${xPos - 1}%`,
            y: "50.5%",
            w: 0.2,
            h: 0.2,
            fill: { color: accentColor },
          });

          if (date) {
            s.addText(date, {
              x: `${xPos - 8}%`,
              y: isAbove ? "38%" : "58%",
              w: "16%",
              h: 0.3,
              fontSize: 10,
              bold: true,
              color: accentColor,
              align: "center",
              fontFace: bodyFont,
            });
          }
          if (desc) {
            s.addText(desc, {
              x: `${xPos - 8}%`,
              y: isAbove ? "43%" : "63%",
              w: "16%",
              h: 0.4,
              fontSize: 9,
              color: secondaryColor,
              align: "center",
              fontFace: bodyFont,
            });
          }
        });
        break;
      }

      case "gantt": {
        const tasks = slide.content
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const parts = l.split("|").map((p) => p.trim());
            return {
              name: parts[0] || "",
              start: parseFloat(parts[1]) || 0,
              duration: parseFloat(parts[2]) || 1,
              color: parts[3] || accentColor,
            };
          });
        const maxEnd = Math.max(...tasks.map((t) => t.start + t.duration), 5);

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

        // Header row
        s.addText("Tâche", {
          x: 0.5,
          y: 1.3,
          w: "25%",
          h: 0.35,
          fontSize: 11,
          bold: true,
          color: secondaryColor,
          fontFace: headingFont,
        });

        // Grid lines and month labels
        for (let i = 0; i <= maxEnd; i++) {
          const xPos = 30 + (i / maxEnd) * 65;
          s.addText(String(i), {
            x: `${xPos - 2}%`,
            y: 1.3,
            w: "4%",
            h: 0.3,
            fontSize: 9,
            color: secondaryColor,
            align: "center",
            fontFace: bodyFont,
          });
          s.addShape(pptx.ShapeType.rect, {
            x: `${xPos}%`,
            y: 1.6,
            w: 0.01,
            h: tasks.length * 0.5 + 0.2,
            fill: { color: secondaryColor, transparency: 70 },
          });
        }

        // Task rows
        tasks.forEach((task, i) => {
          const yPos = 1.7 + i * 0.5;
          const barLeft = 30 + (task.start / maxEnd) * 65;
          const barWidth = (task.duration / maxEnd) * 65;
          const taskColor = task.color.startsWith("#")
            ? stripHash(task.color)
            : accentColor;

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
            w: `${Math.max(barWidth, 2)}%`,
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
