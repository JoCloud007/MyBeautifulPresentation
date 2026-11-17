"use client";

import { useState } from "react";
import { usePresentationStore } from "@/app/stores/presentationStore";
import { SlideElement } from "@/app/types/presentation";

interface CanvasToolbarProps {
  slideIndex: number;
  onSelect: (id: string | null) => void;
}

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SHAPE_TYPES = [
  { id: "rectangle", label: "Rectangle", borderRadius: 4 },
  // A percentage radius is required: a numeric 50 is 50px, which only rounds
  // the corners of a rectangle instead of drawing a circle.
  { id: "circle", label: "Cercle", borderRadius: "50%" },
  { id: "rounded", label: "Arrondi", borderRadius: 16 },
  { id: "line", label: "Ligne", borderRadius: 0 },
  { id: "arrow", label: "Flèche", borderRadius: 4 },
] as const;

export function CanvasToolbar({ slideIndex, onSelect }: CanvasToolbarProps) {
  const { addSlideElement } = usePresentationStore();
  const [shapeOpen, setShapeOpen] = useState(false);

  const addElement = (type: SlideElement["type"], shapeType?: string) => {
    const isShape = type === "shape";
    const isChronology = type === "chronology";
    const isDiagram = type === "diagram";
    const isPowerBi = type === "powerbi";
    const shapeConfig = SHAPE_TYPES.find((s) => s.id === shapeType) || SHAPE_TYPES[0];
    const defaultChronologyRows = [
      { id: 1, task: "Analyse des besoins", start: "2024-01-01", duration: "14 jours", color: "#3b82f6" },
      { id: 2, task: "Développement", start: "2024-01-15", duration: "30 jours", color: "#10b981" },
      { id: 3, task: "Tests & QA", start: "2024-02-14", duration: "10 jours", color: "#f59e0b" },
    ];
    const element: SlideElement = {
      id: generateUUID(),
      type,
      subtype: isChronology ? "gantt" : isDiagram ? "mermaid" : shapeType,
      x: 10,
      y: 10,
      // A circle needs a square box: "50%" on a 30×20 box draws an ellipse.
      w: isChronology || isDiagram || isPowerBi
        ? 80
        : isShape && shapeType === "line"
          ? 40
          : isShape && shapeType === "circle"
            ? 24
            : 30,
      h: isChronology || isDiagram || isPowerBi
        ? 60
        : isShape && shapeType === "line"
          ? 2
          : isShape && shapeType === "circle"
            ? 24
            : type === "text"
              ? 15
              : 20,
      content: isChronology
        ? JSON.stringify({ type: "gantt", rows: defaultChronologyRows })
        : isDiagram
          ? "graph TD\n  A[Start] --> B[End]"
          : isPowerBi
            ? JSON.stringify({ embedUrl: "", title: "Rapport Power BI", mode: "publish-to-web" })
            : (type === "text" ? "Nouveau texte" : type === "table" ? "Cell 1|Cell 2\nCell 3|Cell 4" : type === "image" ? "" : (shapeType || "rectangle")),
      // No hard-coded palette here: elements inherit the active theme at render
      // time (fallbacks in SlideEngine / SlideRenderer / CanvasElement).
      style: {
        fontSize: 20,
        borderRadius: isShape ? shapeConfig.borderRadius : 0,
        borderWidth: isShape && shapeType === "line" ? 0 : 1,
      },
    };
    addSlideElement(slideIndex, element);
    onSelect(element.id);
    setShapeOpen(false);
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-200">
      <span className="text-xs font-semibold text-slate-500 mr-2">Ajouter :</span>
      <button
        onClick={() => addElement("text")}
        className="px-2 py-1 text-xs font-medium bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer transition-colors"
      >
        + Texte
      </button>

      {/* Shape dropdown */}
      <div className="relative">
        <button
          onClick={() => setShapeOpen(!shapeOpen)}
          className="px-2 py-1 text-xs font-medium bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer transition-colors"
        >
          + Forme ▾
        </button>
        {shapeOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-50 min-w-[120px]">
            {SHAPE_TYPES.map((shape) => (
              <button
                key={shape.id}
                onClick={() => addElement("shape", shape.id)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 cursor-pointer transition-colors"
              >
                {shape.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => addElement("table")}
        className="px-2 py-1 text-xs font-medium bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer transition-colors"
      >
        + Tableau
      </button>
      <button
        onClick={() => addElement("image")}
        className="px-2 py-1 text-xs font-medium bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer transition-colors"
      >
        + Image
      </button>
      <button
        onClick={() => addElement("chronology")}
        className="px-2 py-1 text-xs font-medium bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer transition-colors"
      >
        + Chronologie
      </button>
      <button
        onClick={() => addElement("diagram")}
        className="px-2 py-1 text-xs font-medium bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer transition-colors"
      >
        + Diagramme
      </button>
      <button
        onClick={() => addElement("powerbi")}
        className="px-2 py-1 text-xs font-medium bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer transition-colors"
      >
        + Power BI
      </button>
    </div>
  );
}
