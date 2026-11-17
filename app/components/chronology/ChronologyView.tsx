"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { usePresentationStore } from "@/app/stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "@/app/stores/templateStore";
import { GanttEngine } from "@/app/components/GanttEngine";
import { TimelineEngine } from "@/app/components/TimelineEngine";
import { parseGanttContent, parseTimelineContent } from "@/lib/ganttParser";
import { ChronologyRow, SlideElement } from "@/app/types/presentation";
import { Button } from "@/components/ui/button";
import { Save, Plus, Trash2, GitBranch } from "lucide-react";

const CHRONO_TYPES = [
  { id: "gantt", label: "GANTT" },
  { id: "timeline", label: "Timeline" },
  { id: "roadmap", label: "Roadmap" },
];

type DataRow = ChronologyRow;

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

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

function nextId(rows: DataRow[]): number {
  if (rows.length === 0) return 1;
  return Math.max(...rows.map((r) => r.id)) + 1;
}

function getDescendants(rows: DataRow[], parentId: number): number[] {
  const direct = rows.filter((r) => r.parentId === parentId).map((r) => r.id);
  return [...direct, ...direct.flatMap((id) => getDescendants(rows, id))];
}

function flattenWithIndent(rows: DataRow[]): Array<{ row: DataRow; indent: number }> {
  const roots = rows.filter((r) => !r.parentId);
  const result: Array<{ row: DataRow; indent: number }> = [];
  function addChildren(parentId: number | undefined, indent: number) {
    const children = rows.filter((r) => r.parentId === parentId);
    for (const child of children) {
      result.push({ row: child, indent });
      addChildren(child.id, indent + 1);
    }
  }
  for (const root of roots) {
    result.push({ row: root, indent: 0 });
    addChildren(root.id, 1);
  }
  return result;
}

export function ChronologyView() {
  const [activeType, setActiveType] = useState("gantt");
  const [rows, setRows] = useState<DataRow[]>([
    { id: 1, task: "Analyse des besoins", start: "2024-01-01", duration: "14 jours", color: "#3b82f6" },
    { id: 2, task: "Développement", start: "2024-01-15", duration: "30 jours", color: "#10b981" },
    { id: 3, task: "Tests & QA", start: "2024-02-14", duration: "10 jours", color: "#f59e0b" },
  ]);

  const { currentSlideIndex, updateSlide, addSlideElement } = usePresentationStore();
  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);

  // Restore persisted chronology data on mount / slide change
  useEffect(() => {
    const slide = usePresentationStore.getState().presentation?.slides[currentSlideIndex];
    if (slide?.data?.chronology?.rows) {
      setRows(slide.data.chronology.rows);
      setActiveType(slide.data.chronology.type);
    } else {
      setRows([
        { id: 1, task: "Analyse des besoins", start: "2024-01-01", duration: "14 jours", color: "#3b82f6" },
        { id: 2, task: "Développement", start: "2024-01-15", duration: "30 jours", color: "#10b981" },
        { id: 3, task: "Tests & QA", start: "2024-02-14", duration: "10 jours", color: "#f59e0b" },
      ]);
      setActiveType("gantt");
    }
  }, [currentSlideIndex]);

  const addRow = (parentId?: number) => {
    setRows((prev) => {
      const newId = nextId(prev);
      const sibling = parentId
        ? prev.filter((r) => r.parentId === parentId).pop()
        : prev.filter((r) => !r.parentId).pop();
      const start = sibling ? addDays(sibling.start, parseDurationDays(sibling.duration)) : "2024-01-01";
      return [
        ...prev,
        {
          id: newId,
          task: parentId ? "Nouvelle sous-tâche" : "Nouvelle tâche",
          start,
          duration: "7 jours",
          color: COLORS[prev.length % COLORS.length],
          parentId,
        },
      ];
    });
  };

  const updateRow = (id: number, field: keyof DataRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeRow = (id: number) => {
    setRows((prev) => {
      const toRemove = new Set([id, ...getDescendants(prev, id)]);
      return prev.filter((r) => !toRemove.has(r.id));
    });
  };

  // Sync rows to slide.data.chronology and chronology elements
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    const slide = usePresentationStore.getState().presentation?.slides[currentSlideIndex];
    if (!slide) return;
    const chronologyData = { rows, type: activeType as "gantt" | "timeline" | "roadmap" };
    const updatedSlide: typeof slide = { ...slide, data: { ...slide.data, chronology: chronologyData } };
    if (slide.elements) {
      const hasChronology = slide.elements.some((el) => el.type === "chronology");
      if (hasChronology) {
        updatedSlide.elements = slide.elements.map((el) =>
          el.type === "chronology" ? { ...el, content: JSON.stringify(chronologyData) } : el
        );
      }
    }
    updateSlide(currentSlideIndex, updatedSlide);
  }, [rows, activeType, currentSlideIndex]);

  // Build preview data (include all rows, flat)
  const previewData = useMemo(() => {
    if (activeType === "gantt") {
      const content = rows
        .map((r) => {
          const end = addDays(r.start, parseDurationDays(r.duration));
          return `${r.task} | ${r.start} | ${end}${r.color ? ` | ${r.color}` : ""}`;
        })
        .join("\n");
      return { type: "gantt" as const, data: parseGanttContent(content) };
    }
    if (activeType === "timeline") {
      const content = rows.map((r) => `${r.start} - ${r.task}`).join("\n");
      return { type: "timeline" as const, data: parseTimelineContent(content) };
    }
    return { type: "roadmap" as const, data: [] };
  }, [rows, activeType]);

  const handleInsert = () => {
    const chronologyData = { rows, type: activeType as "gantt" | "timeline" | "roadmap" };
    const element: SlideElement = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      type: "chronology",
      subtype: activeType,
      x: 10,
      y: 20,
      w: 80,
      h: 60,
      content: JSON.stringify(chronologyData),
    };
    addSlideElement(currentSlideIndex, element);
  };

  const flatRows = flattenWithIndent(rows);

  return (
    <div className="flex flex-col h-full">
      {/* Type selector */}
      <div className="flex gap-2 p-4 border-b border-slate-200 items-center">
        {CHRONO_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => setActiveType(type.id)}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${
              activeType === type.id
                ? "bg-slate-900 text-white"
                : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {type.label}
          </button>
        ))}
        <button
          onClick={() => addRow()}
          className="ml-auto px-3 py-2 bg-slate-100 border border-slate-200 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors flex items-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Ajouter une tâche
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Data table */}
        <div className="w-1/2 border-r border-slate-200 flex flex-col">
          <div className="flex-1 overflow-auto p-4">
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[40px_1fr_120px_100px_80px_80px] px-4 py-3 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <div>#</div>
                <div>Tâche</div>
                <div>Début</div>
                <div>Durée</div>
                <div>Couleur</div>
                <div></div>
              </div>
              {flatRows.map(({ row, indent }) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[40px_1fr_120px_100px_80px_80px] px-4 py-2 border-b border-slate-100 items-center text-sm"
                >
                  <div className="text-slate-500">{row.id}</div>
                  <div className="flex items-center gap-1" style={{ paddingLeft: `${indent * 16}px` }}>
                    {indent > 0 && <GitBranch className="h-3 w-3 text-slate-400" />}
                    <input
                      value={row.task}
                      onChange={(e) => updateRow(row.id, "task", e.target.value)}
                      className="flex-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                  <input
                    value={row.start}
                    onChange={(e) => updateRow(row.id, "start", e.target.value)}
                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm outline-none focus:border-slate-400"
                  />
                  <input
                    value={row.duration}
                    onChange={(e) => updateRow(row.id, "duration", e.target.value)}
                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm outline-none focus:border-slate-400"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={row.color}
                      onChange={(e) => updateRow(row.id, "color", e.target.value)}
                      className="w-5 h-5 rounded border border-slate-200 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => addRow(row.id)}
                      className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
                      title="Ajouter une sous-tâche"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => removeRow(row.id)}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border-t border-slate-200">
            <Button onClick={handleInsert} className="w-full" size="sm">
              <Save className="mr-2 h-4 w-4" />
              Insérer dans la slide
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="w-1/2 flex flex-col">
          <div className="px-4 py-2 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-700">Aperçu live</span>
          </div>
          <div className="flex-1 p-4 bg-slate-50 overflow-auto">
            {template && previewData.type === "gantt" && (
              <div className="w-full h-full min-h-[200px]">
                <GanttEngine
                  tasks={previewData.data}
                  colors={template.colors}
                  fonts={template.fonts}
                  scale={1}
                />
              </div>
            )}
            {template && previewData.type === "timeline" && (
              <div className="w-full h-full min-h-[200px]">
                <TimelineEngine
                  events={previewData.data}
                  colors={template.colors}
                  fonts={template.fonts}
                  scale={1}
                />
              </div>
            )}
            {previewData.type === "roadmap" && (
              <div className="flex items-center justify-center h-full text-sm text-slate-400">
                Aperçu roadmap — {rows.length} éléments
              </div>
            )}
            {!template && (
              <div className="flex items-center justify-center h-full text-sm text-slate-400">
                Aucun template actif
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
