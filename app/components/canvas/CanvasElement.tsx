"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { SlideElement, ChronologyRow, PowerBiConfig } from "@/app/types/presentation";
import { usePresentationStore } from "@/app/stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "@/app/stores/templateStore";
import { GanttEngine } from "@/app/components/GanttEngine";
import { TimelineEngine } from "@/app/components/TimelineEngine";
import { MermaidEngine } from "@/app/components/MermaidEngine";
import { PowerBiEngine } from "@/app/components/PowerBiEngine";
import { parseGanttContent, parseTimelineContent } from "@/lib/ganttParser";

interface CanvasElementProps {
  element: SlideElement;
  isSelected: boolean;
  canvasWidth: number;
  canvasHeight: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<SlideElement>) => void;
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

function DiagramRenderer({ element }: { element: SlideElement }) {
  const type = element.subtype || "mermaid";
  const bgColor = element.style?.backgroundColor || "transparent";
  if (type === "mermaid") {
    return (
      <div className="w-full h-full overflow-hidden" style={{ backgroundColor: bgColor }}>
        <MermaidEngine code={element.content || "graph TD\n  A[Start] --> B[End]"} />
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
      Diagramme
    </div>
  );
}

function ChronologyRenderer({ element }: { element: SlideElement }) {
  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);
  const data = (() => {
    try {
      return JSON.parse(element.content || "{}") || {};
    } catch {
      return {};
    }
  })();
  const type = element.subtype || data.type || "gantt";
  const rows: ChronologyRow[] = data.rows || [];
  const bgColor = element.style?.backgroundColor || "transparent";

  if (!template || rows.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400" style={{ backgroundColor: bgColor }}>
        Chronologie
      </div>
    );
  }

  if (type === "gantt") {
    const content = rows
      .map((r: ChronologyRow) => {
        const end = addDays(r.start, parseDurationDays(r.duration));
        return `${r.task} | ${r.start} | ${end}${r.color ? ` | ${r.color}` : ""}`;
      })
      .join("\n");
    const tasks = parseGanttContent(content);
    return (
      <div className="w-full h-full overflow-hidden" style={{ backgroundColor: bgColor }}>
        <GanttEngine tasks={tasks} colors={template.colors} fonts={template.fonts} scale={0.5} />
      </div>
    );
  }

  if (type === "timeline") {
    const content = rows.map((r: ChronologyRow) => `${r.start} - ${r.task}`).join("\n");
    const events = parseTimelineContent(content);
    return (
      <div className="w-full h-full overflow-hidden" style={{ backgroundColor: bgColor }}>
        <TimelineEngine events={events} colors={template.colors} fonts={template.fonts} scale={0.5} />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
      Roadmap
    </div>
  );
}

export function CanvasElement({
  element,
  isSelected,
  canvasWidth,
  canvasHeight,
  onSelect,
  onUpdate,
}: CanvasElementProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const dragStart = useRef({ x: 0, y: 0, elX: 0, elY: 0 });
  const resizeStart = useRef({ x: 0, y: 0, elW: 0, elH: 0, elX: 0, elY: 0 });

  // Theme fallbacks: text/shapes without explicit colors inherit the active
  // template instead of a hard-coded palette (readable on any background).
  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);
  const themeTextColor = template.colors.foreground;
  const themeShapeBg = template.colors.muted;
  const themeBorderColor = template.colors.border;

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [isEditing]);

  const pxX = (element.x / 100) * canvasWidth;
  const pxY = (element.y / 100) * canvasHeight;
  const pxW = (element.w / 100) * canvasWidth;
  const pxH = (element.h / 100) * canvasHeight;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return;
      e.stopPropagation();
      onSelect();
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        elX: element.x,
        elY: element.y,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = ((moveEvent.clientX - dragStart.current.x) / canvasWidth) * 100;
        const dy = ((moveEvent.clientY - dragStart.current.y) / canvasHeight) * 100;
        onUpdate({
          x: Math.max(0, Math.min(100 - element.w, dragStart.current.elX + dx)),
          y: Math.max(0, Math.min(100 - element.h, dragStart.current.elY + dy)),
        });
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [element.x, element.y, element.w, element.h, canvasWidth, canvasHeight, onSelect, onUpdate, isEditing]
  );

  const { setSlideEditType } = usePresentationStore();

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (element.type === "text") {
        setIsEditing(true);
      } else if (element.type === "powerbi") {
        setSlideEditType("powerbi");
      }
    },
    [element.type, setSlideEditType]
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsResizing(true);
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        elW: element.w,
        elH: element.h,
        elX: element.x,
        elY: element.y,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = ((moveEvent.clientX - resizeStart.current.x) / canvasWidth) * 100;
        const dy = ((moveEvent.clientY - resizeStart.current.y) / canvasHeight) * 100;
        onUpdate({
          w: Math.max(5, resizeStart.current.elW + dx),
          h: Math.max(5, resizeStart.current.elH + dy),
        });
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [element.w, element.h, canvasWidth, canvasHeight, onUpdate]
  );

  const style = element.style || {};
  const isText = element.type === "text";

  return (
    <div
      className={`absolute group ${isSelected ? "ring-2 ring-blue-500" : ""} ${
        isDragging || isResizing ? "cursor-grabbing" : isText && !isEditing ? "cursor-text" : "cursor-grab"
      }`}
      style={{
        left: pxX,
        top: pxY,
        width: pxW,
        height: pxH,
        zIndex: style.zIndex ?? 1,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* Content */}
      <div
        className="w-full h-full overflow-hidden"
        style={{
          backgroundColor: style.backgroundColor || (isText ? "transparent" : themeShapeBg),
          borderRadius: style.borderRadius || 0,
          border: style.borderWidth
            ? `${style.borderWidth}px solid ${style.borderColor || themeBorderColor}`
            : isText
            ? "none"
            : `1px solid ${themeBorderColor}`,
          opacity: style.opacity ?? 1,
          transform: style.rotation ? `rotate(${style.rotation}deg)` : undefined,
        }}
      >
        {isText ? (
          isEditing ? (
            <textarea
              ref={editRef}
              className="w-full h-full outline-none p-2 resize-none border-0 bg-transparent"
              style={{
                fontSize: style.fontSize || 20,
                fontFamily: style.fontFamily || "system-ui, sans-serif",
                fontWeight: style.fontWeight || 400,
                color: style.color || themeTextColor,
                textAlign: style.textAlign || "left",
                lineHeight: 1.4,
              }}
              defaultValue={element.content || ""}
              onBlur={(e) => {
                onUpdate({ content: e.currentTarget.value });
                setIsEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsEditing(false);
                }
              }}
            />
          ) : (
            <div
              className="w-full h-full p-2 select-none"
              style={{
                fontSize: style.fontSize || 20,
                fontFamily: style.fontFamily || "system-ui, sans-serif",
                fontWeight: style.fontWeight || 400,
                color: style.color || themeTextColor,
                textAlign: style.textAlign || "left",
                lineHeight: 1.4,
                pointerEvents: "none",
              }}
            >
              {element.content || "Double-cliquez pour éditer"}
            </div>
          )
        ) : element.type === "shape" ? (
          <div className="w-full h-full" />
        ) : element.type === "table" ? (
          <div className="w-full h-full p-1 overflow-auto text-xs">
            <table className="w-full border-collapse">
              <tbody>
                {(element.content || "").split("\n").map((row, ri) => (
                  <tr key={ri}>
                    {row.split("|").map((cell, ci) => (
                      <td key={ci} className="border border-slate-300 p-1">
                        {cell.trim()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : element.type === "chronology" ? (
          <ChronologyRenderer element={element} />
        ) : element.type === "diagram" ? (
          <DiagramRenderer element={element} />
        ) : element.type === "powerbi" ? (
          (() => {
            try {
              const config = JSON.parse(element.content || "{}") as PowerBiConfig;
              return (
                <div
                  className="w-full h-full"
                  style={{
                    backgroundColor: element.style?.backgroundColor || "transparent",
                    pointerEvents: isDragging || isResizing ? "none" : "auto",
                  }}
                >
                  <PowerBiEngine config={config} mode="edit" />
                </div>
              );
            } catch {
              return (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                  Power BI
                </div>
              );
            }
          })()
        ) : element.type === "image" ? (
          element.content ? (
            <img
              src={element.content}
              alt="Slide image"
              className="w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
              Image
            </div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
            {element.type}
          </div>
        )}
      </div>

      {/* Resize handle */}
      {isSelected && !isEditing && (
        <div
          className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-se-resize border-2 border-white shadow"
          onMouseDown={handleResizeMouseDown}
        />
      )}

      {/* Edit hint for text */}
      {isText && !isEditing && isSelected && (
        <div className="absolute -top-5 left-0 text-[9px] text-blue-500 bg-white px-1 rounded border border-blue-200 shadow-sm whitespace-nowrap">
          Double-cliquez pour éditer
        </div>
      )}
    </div>
  );
}
