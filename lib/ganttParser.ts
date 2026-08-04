import { GanttTask, TimelineEvent, TimeScale } from "../app/types/presentation";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function parseDate(input: string): Date | null {
  const trimmed = input.trim();
  // Try ISO 8601 YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    if (!isNaN(d.getTime())) return d;
  }
  // Try French/European DD/MM/YYYY
  const frMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (frMatch) {
    const d = new Date(Number(frMatch[3]), Number(frMatch[2]) - 1, Number(frMatch[1]));
    if (!isNaN(d.getTime())) return d;
  }
  // Try loose Date.parse (handles "Jan 2020", "15 Jan 2020", etc.)
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// ─── GANTT Parsing ───────────────────────────────────────────────────────────

/**
 * Parse GANTT content in the format:
 *   Task Name | Start | DurationOrEnd | Color
 *
 * Start and DurationOrEnd can be:
 * - Numbers (legacy): start=index, end=start+duration
 * - Dates: YYYY-MM-DD or DD/MM/YYYY
 * - Mixed: start as number (days from project start), end as date
 */
export function parseGanttContent(content: string): GanttTask[] {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const tasks: GanttTask[] = [];
  let projectStart: Date | null = null;

  // First pass: detect if we have real dates or legacy numbers
  const hasDates = lines.some((line) => {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 2) return false;
    return parseDate(parts[1]) !== null;
  });

  if (!hasDates) {
    // Legacy mode: numbers only
    // We need a project start date. Use 2020-01-01 as default.
    projectStart = new Date(2020, 0, 1);
  }

  for (const line of lines) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 2) continue;

    const name = parts[0];
    const startRaw = parts[1];
    const endOrDurationRaw = parts[2] || "";
    const color = parts[3] || undefined;

    let startDate: Date;
    let endDate: Date;

    const startParsed = parseDate(startRaw);
    if (startParsed) {
      // Real date mode
      startDate = startParsed;
      const endParsed = parseDate(endOrDurationRaw);
      if (endParsed) {
        endDate = endParsed;
      } else {
        // Treat as duration in days
        const duration = Number.isNaN(parseFloat(endOrDurationRaw)) ? 30 : parseFloat(endOrDurationRaw);
        endDate = addDays(startDate, duration);
      }
    } else {
      // Legacy number mode (mixed: numeric start + date end also supported)
      const startIndex = parseFloat(startRaw) || 0;
      startDate = addDays(projectStart ?? new Date(2020, 0, 1), startIndex * 30); // 30 days per unit
      const endParsed = parseDate(endOrDurationRaw);
      if (endParsed) {
        endDate = endParsed;
      } else {
        const duration = Number.isNaN(parseFloat(endOrDurationRaw)) ? 1 : parseFloat(endOrDurationRaw);
        endDate = addDays(startDate, duration * 30);
      }
    }

    tasks.push({
      id: generateUUID(),
      name,
      startDate: formatDateISO(startDate),
      endDate: formatDateISO(endDate),
      color,
      progress: undefined,
    });
  }

  return tasks;
}

/**
 * Format GANTT tasks back to the legacy text format for fallback.
 */
export function formatGanttTasks(tasks: GanttTask[]): string {
  return tasks
    .map((t) => {
      const parts = [t.name, t.startDate, t.endDate];
      if (t.color) parts.push(t.color);
      return parts.join(" | ");
    })
    .join("\n");
}

// ─── Timeline Parsing ────────────────────────────────────────────────────────

/**
 * Parse Timeline content in the format:
 *   Date - Description
 *   or:  YYYY-MM-DD - Event title - description
 */
export function parseTimelineContent(content: string): TimelineEvent[] {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const events: TimelineEvent[] = [];

  for (const line of lines) {
    // Find the first " - " separator
    const sepIndex = line.indexOf(" - ");
    if (sepIndex < 0) {
      // No separator, treat whole line as description with no date
      events.push({
        id: generateUUID(),
        date: formatDateISO(new Date()),
        title: line,
      });
      continue;
    }

    const dateRaw = line.slice(0, sepIndex).trim();
    const rest = line.slice(sepIndex + 3).trim();

    const date = parseDate(dateRaw);

    // Try to split title and description by another " - "
    const descSep = rest.indexOf(" - ");
    let title = rest;
    let description: string | undefined;
    if (descSep >= 0) {
      title = rest.slice(0, descSep).trim();
      description = rest.slice(descSep + 3).trim();
    }

    events.push({
      id: generateUUID(),
      date: date ? formatDateISO(date) : formatDateISO(new Date()),
      title,
      description,
    });
  }

  return events;
}

/**
 * Format timeline events back to text for fallback.
 */
export function formatTimelineEvents(events: TimelineEvent[]): string {
  return events
    .map((e) => {
      let line = `${e.date} - ${e.title}`;
      if (e.description) line += ` - ${e.description}`;
      return line;
    })
    .join("\n");
}

// ─── Time Scale Detection ────────────────────────────────────────────────────

export function detectTimeScale(minDate: Date, maxDate: Date): TimeScale {
  const diffMs = maxDate.getTime() - minDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 14) return "days";
  if (diffDays < 90) return "weeks";
  if (diffDays < 730) return "months";     // < 2 years
  if (diffDays < 1825) return "quarters";  // < 5 years
  return "years";
}

// ─── Scale Helpers ───────────────────────────────────────────────────────────

export interface ScaleMarker {
  label: string;
  position: number; // 0-1 fraction along the axis
  isMajor: boolean;
}

export function generateScaleMarkers(
  minDate: Date,
  maxDate: Date,
  scale: TimeScale
): ScaleMarker[] {
  const markers: ScaleMarker[] = [];
  const totalMs = maxDate.getTime() - minDate.getTime();

  const start = new Date(minDate);
  const end = new Date(maxDate);

  switch (scale) {
    case "days": {
      const d = new Date(start);
      while (d <= end) {
        const pos = totalMs ? (d.getTime() - minDate.getTime()) / totalMs : 0;
        const isMajor = d.getDate() === 1;
        markers.push({
          label: `${d.getDate()}`,
          position: pos,
          isMajor,
        });
        d.setDate(d.getDate() + 1);
      }
      break;
    }
    case "weeks": {
      const d = new Date(start);
      // Align to Monday
      const dayOfWeek = d.getDay();
      const diff = d.getDay() === 0 ? -6 : 1 - dayOfWeek;
      d.setDate(d.getDate() + diff);
      while (d <= end) {
        const pos = totalMs ? (d.getTime() - minDate.getTime()) / totalMs : 0;
        markers.push({
          label: `S${getWeekNumber(d)}`,
          position: pos,
          isMajor: false,
        });
        d.setDate(d.getDate() + 7);
      }
      break;
    }
    case "months": {
      const d = new Date(start.getFullYear(), start.getMonth(), 1);
      while (d <= end) {
        const pos = totalMs ? (d.getTime() - minDate.getTime()) / totalMs : 0;
        const isMajor = d.getMonth() === 0;
        markers.push({
          label: d.toLocaleDateString("fr-FR", { month: "short" }),
          position: pos,
          isMajor,
        });
        d.setMonth(d.getMonth() + 1);
      }
      break;
    }
    case "quarters": {
      const d = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
      while (d <= end) {
        const pos = totalMs ? (d.getTime() - minDate.getTime()) / totalMs : 0;
        const q = Math.floor(d.getMonth() / 3) + 1;
        markers.push({
          label: `T${q}`,
          position: pos,
          isMajor: q === 1,
        });
        d.setMonth(d.getMonth() + 3);
      }
      break;
    }
    case "years": {
      const d = new Date(start.getFullYear(), 0, 1);
      while (d <= end) {
        const pos = totalMs ? (d.getTime() - minDate.getTime()) / totalMs : 0;
        markers.push({
          label: String(d.getFullYear()),
          position: pos,
          isMajor: true,
        });
        d.setFullYear(d.getFullYear() + 1);
      }
      break;
    }
  }

  return markers;
}

function getWeekNumber(d: Date): number {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ─── Position Helpers ────────────────────────────────────────────────────────

export function getTaskPosition(
  task: GanttTask,
  minDate: Date,
  maxDate: Date
): { left: number; width: number } {
  const totalMs = maxDate.getTime() - minDate.getTime();
  const start = new Date(task.startDate).getTime();
  const end = new Date(task.endDate).getTime();
  const left = ((start - minDate.getTime()) / totalMs) * 100;
  const width = ((end - start) / totalMs) * 100;
  return { left: Math.max(0, left), width: Math.max(0.5, width) };
}

export function getEventPosition(
  event: TimelineEvent,
  minDate: Date,
  maxDate: Date
): number {
  const totalMs = maxDate.getTime() - minDate.getTime();
  const date = new Date(event.date).getTime();
  return ((date - minDate.getTime()) / totalMs) * 100;
}

// ─── Date Range ──────────────────────────────────────────────────────────────

export function getDateRange(tasks: GanttTask[]): { min: Date; max: Date } {
  if (tasks.length === 0) {
    const now = new Date();
    return { min: now, max: addDays(now, 30) };
  }
  const dates = tasks.flatMap((t) => [new Date(t.startDate), new Date(t.endDate)]);
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  // Add padding
  const padding = (max.getTime() - min.getTime()) * 0.05;
  return {
    min: new Date(min.getTime() - padding),
    max: new Date(max.getTime() + padding),
  };
}

export function getTimelineDateRange(events: TimelineEvent[]): { min: Date; max: Date } {
  if (events.length === 0) {
    const now = new Date();
    return { min: now, max: addDays(now, 30) };
  }
  const dates = events.map((e) => new Date(e.date));
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  const padding = (max.getTime() - min.getTime()) * 0.1;
  return {
    min: new Date(min.getTime() - padding),
    max: new Date(max.getTime() + padding),
  };
}
