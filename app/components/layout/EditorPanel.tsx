"use client";

import { useState } from "react";
import { usePresentationStore, legacySlideToElements } from "@/app/stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "@/app/stores/templateStore";
import { SlideEditor } from "@/app/components/SlideEditor";
import { ChronologyView } from "@/app/components/chronology/ChronologyView";
import { DiagramView } from "@/app/components/diagram/DiagramView";
import { PowerBiView } from "@/app/components/powerbi/PowerBiView";
import { SlideElement } from "@/app/types/presentation";
import { Palette, Plus, Trash2 } from "lucide-react";

interface EditorPanelProps {
  className?: string;
}

export function EditorPanel({ className }: EditorPanelProps) {
  const { presentation, currentSlideIndex, slideEditType, setSlideEditType, setSlideElements, addSlide, removeSlide, updateSlide } = usePresentationStore();
  const [editingTitle, setEditingTitle] = useState(false);

  const renderEditor = () => {
    switch (slideEditType) {
      case "chronology":
        return <ChronologyView />;
      case "diagram":
        return <DiagramView />;
      case "powerbi":
        return <PowerBiView />;
      case "content":
      default:
        return <SlideEditor />;
    }
  };

  const types = [
    { id: "content" as const, label: "Contenu" },
    { id: "chronology" as const, label: "Chronologie" },
    { id: "diagram" as const, label: "Diagramme" },
    { id: "powerbi" as const, label: "Power BI" },
  ];

  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);

  const applyTheme = () => {
    if (!presentation || !template) return;
    const slide = presentation.slides[currentSlideIndex];
    if (!slide) return;

    const elements = slide.elements != null
      ? slide.elements
      : legacySlideToElements(slide);

    const headingFont = template.fonts.heading;
    const bodyFont = template.fonts.body;
    // Body text uses the theme foreground (readable on the theme background);
    // the title/body distinction is carried by fonts and weight, not by an
    // attenuated grey that hurts readability.
    const fgColor = template.colors.foreground;

    const textElements = elements.filter((e: SlideElement) => e.type === "text");
    const titleElement = textElements[0];

    const updatedElements: SlideElement[] = elements.map((el: SlideElement) => {
      if (el.type !== "text") return el;
      const isTitle = el.id === titleElement?.id;
      return {
        ...el,
        style: {
          ...el.style,
          fontFamily: isTitle ? headingFont : bodyFont,
          color: fgColor,
          backgroundColor: undefined,
        },
      };
    });

    setSlideElements(currentSlideIndex, updatedElements);
  };

  return (
    <div className={`flex flex-col h-full bg-slate-100 ${className}`}>
      {/* Toolbar */}
      <div className="flex gap-2 items-center px-4 py-2 bg-white border-b border-slate-200">
        <div className="px-3 py-1 bg-slate-100 rounded-md text-xs font-semibold text-slate-600 select-none">
          Slide {currentSlideIndex + 1} / {presentation?.slides.length || 0}
        </div>
        {presentation && (
          <>
            <div className="w-px h-5 bg-slate-200" />
            {editingTitle ? (
              <input
                autoFocus
                type="text"
                value={presentation.slides[currentSlideIndex]?.title || ""}
                onChange={(e) => updateSlide(currentSlideIndex, { title: e.target.value })}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => { if (e.key === "Enter") setEditingTitle(false); }}
                className="px-2 py-1 text-xs border border-slate-300 rounded-md outline-none focus:border-slate-500 w-40"
              />
            ) : (
              <button
                onClick={() => setEditingTitle(true)}
                className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 rounded-md border border-transparent hover:border-slate-200 cursor-pointer truncate max-w-[120px]"
                title="Cliquer pour renommer"
              >
                {presentation.slides[currentSlideIndex]?.title || "Sans titre"}
              </button>
            )}
          </>
        )}
        <div className="w-px h-5 bg-slate-200" />
        <button
          onClick={() => addSlide()}
          className="px-2 py-1 rounded-md text-xs font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center gap-1"
          title="Nouvelle slide"
        >
          <Plus className="h-3 w-3" />
          Nouvelle
        </button>
        <button
          onClick={() => {
            if (presentation && presentation.slides.length > 1) {
              removeSlide(currentSlideIndex);
            }
          }}
          disabled={!presentation || presentation.slides.length <= 1}
          className="px-2 py-1 rounded-md text-xs font-medium border border-slate-300 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          title="Supprimer slide"
        >
          <Trash2 className="h-3 w-3" />
          Supprimer
        </button>
        <div className="w-px h-5 bg-slate-200" />
        {types.map((type) => (
          <button
            key={type.id}
            onClick={() => setSlideEditType(type.id)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              slideEditType === type.id
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {type.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          className="px-3 py-1 rounded-md text-xs font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center gap-1"
          onClick={applyTheme}
          title="Appliquer les couleurs et polices du thème"
        >
          <Palette className="h-3 w-3" />
          Appliquer thème
        </button>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-hidden">
        {renderEditor()}
      </div>
    </div>
  );
}
