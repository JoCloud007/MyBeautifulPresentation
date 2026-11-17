import html2canvas from "html2canvas";
import { createRoot, type Root } from "react-dom/client";
import { GanttEngine } from "@/app/components/GanttEngine";
import { TimelineEngine } from "@/app/components/TimelineEngine";
import { parseGanttContent, parseTimelineContent } from "@/lib/ganttParser";
import { ChronologyRow } from "@/app/types/presentation";
import { TemplateColor, TemplateFont } from "@/app/types/template";

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

function createHiddenContainer(width: number, height: number): { div: HTMLDivElement; id: string } {
  const id = `capture-${Math.random().toString(36).slice(2)}`;
  const div = document.createElement("div");
  div.style.position = "fixed";
  div.style.top = "0";
  div.style.left = "0";
  div.style.width = `${width}px`;
  div.style.height = `${height}px`;
  div.style.overflow = "hidden";
  div.style.opacity = "0";
  div.style.pointerEvents = "none";
  div.style.zIndex = "-1";
  div.setAttribute("data-capture-id", id);
  document.body.appendChild(div);
  return { div, id };
}

function onHtml2CanvasClone(clonedDoc: Document, captureId: string) {
  const el = clonedDoc.querySelector(`[data-capture-id="${captureId}"]`);
  if (el instanceof HTMLElement) {
    el.style.opacity = "1";
  }
}

function cleanupContainer(div: HTMLDivElement, root: Root): void {
  try {
    root.unmount();
  } catch {
    // ignore
  }
  if (div.parentNode) {
    div.parentNode.removeChild(div);
  }
}

async function waitForRender(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CaptureOptions {
  width?: number;
  height?: number;
  pixelRatio?: number;
}

export async function captureGanttChart(
  rows: ChronologyRow[],
  colors: TemplateColor,
  fonts: TemplateFont,
  backgroundColor?: string,
  options: CaptureOptions = {}
): Promise<string | null> {
  if (rows.length === 0) return null;

  const content = rows
    .map((r) => {
      const end = addDays(r.start, parseDurationDays(r.duration));
      return `${r.task} | ${r.start} | ${end}${r.color ? ` | ${r.color}` : ""}`;
    })
    .join("\n");

  const tasks = parseGanttContent(content);
  if (tasks.length === 0) return null;

  const width = options.width || 1200;
  const height = options.height || 600;
  const pixelRatio = options.pixelRatio || 2;

  const { div, id } = createHiddenContainer(width, height);
  const root = createRoot(div);

  try {
    root.render(
      <div
        style={{
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor: backgroundColor || "transparent",
          overflow: "hidden",
        }}
      >
        <GanttEngine tasks={tasks} colors={colors} fonts={fonts} scale={0.5} noTruncate />
      </div>
    );

    await waitForRender(1000);

    const canvas = await html2canvas(div, {
      scale: pixelRatio,
      backgroundColor: backgroundColor || null,
      logging: false,
      useCORS: true,
      onclone: (clonedDoc) => onHtml2CanvasClone(clonedDoc, id),
    });

    return canvas.toDataURL("image/png");
  } finally {
    cleanupContainer(div, root);
  }
}

export async function captureTimelineChart(
  rows: ChronologyRow[],
  colors: TemplateColor,
  fonts: TemplateFont,
  backgroundColor?: string,
  options: CaptureOptions = {}
): Promise<string | null> {
  if (rows.length === 0) return null;

  const content = rows.map((r) => `${r.start} - ${r.task}`).join("\n");
  const events = parseTimelineContent(content);
  if (events.length === 0) return null;

  const width = options.width || 1200;
  const height = options.height || 600;
  const pixelRatio = options.pixelRatio || 2;

  const { div, id } = createHiddenContainer(width, height);
  const root = createRoot(div);

  try {
    root.render(
      <div
        style={{
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor: backgroundColor || "transparent",
          overflow: "hidden",
        }}
      >
        <TimelineEngine events={events} colors={colors} fonts={fonts} scale={1} />
      </div>
    );

    await waitForRender(1000);

    const canvas = await html2canvas(div, {
      scale: pixelRatio,
      backgroundColor: backgroundColor || null,
      logging: false,
      useCORS: true,
      onclone: (clonedDoc) => onHtml2CanvasClone(clonedDoc, id),
    });

    return canvas.toDataURL("image/png");
  } finally {
    cleanupContainer(div, root);
  }
}
