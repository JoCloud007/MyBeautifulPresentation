"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Slide, SlideElement, SlideElementStyle } from "@/app/types/presentation";
import { Template } from "@/app/types/template";
import { usePresentationStore, legacySlideToElements } from "@/app/stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "@/app/stores/templateStore";
import { CanvasElement } from "./CanvasElement";
import { CanvasToolbar } from "./CanvasToolbar";
import { PropertiesPanel } from "./PropertiesPanel";
import { SlideRenderer } from "@/app/components/SlideRenderer";
import { isSlideThemeId, SlideThemeDecor } from "@/app/design-system/slide-themes";

interface SlideCanvasProps {
  slide: Slide;
  slideIndex: number;
  template?: Template;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450; // 16:9

export function SlideCanvas({ slide, slideIndex, template }: SlideCanvasProps) {
  const { updateSlideElement, setSlideElements, removeSlideElement } = usePresentationStore();
  const templateState = useTemplateStore();
  const activeTemplate = template || getActiveTemplate(templateState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedId(null);
  }, [slideIndex]);

  // Delete selected element with Delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!selectedId) return;
      // Don't delete if user is typing in a text field
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if ((active as HTMLElement).isContentEditable) return;
      }
      removeSlideElement(slideIndex, selectedId);
      setSelectedId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, slideIndex, removeSlideElement]);

  // Ensure elements exist (migration) — only if undefined, not if empty array
  const elements = slide.elements != null ? slide.elements : legacySlideToElements(slide);

  // Save migration to store after render — skip special layouts (rendered by SlideRenderer)
  useEffect(() => {
    if (slide.elements == null && !["gantt", "timeline", "mermaid", "excalidraw", "roadmap"].includes(slide.layout)) {
      const migrated = legacySlideToElements(slide);
      setSlideElements(slideIndex, migrated);
    }
  }, [slide.elements, slideIndex, slide, setSlideElements]);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const handleUpdateElement = useCallback(
    (id: string, updates: Partial<SlideElement>) => {
      updateSlideElement(slideIndex, id, updates);
    },
    [slideIndex, updateSlideElement]
  );

  const selectedElement = elements.find((e) => e.id === selectedId) || null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <CanvasToolbar
        slideIndex={slideIndex}
        onSelect={handleSelect}
      />

      {/* Canvas area */}
      <div className="flex-1 flex items-center justify-center bg-slate-200 overflow-auto p-4">
        <div
          ref={canvasRef}
          className="relative shadow-lg"
          style={{
            backgroundColor: activeTemplate?.colors.background || "#ffffff",
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            flexShrink: 0,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleSelect(null);
          }}
        >
          {isSlideThemeId(activeTemplate?.slideTheme) && (
            <SlideThemeDecor
              themeId={activeTemplate.slideTheme}
              accent={activeTemplate.colors.accent}
            />
          )}
          {["gantt", "timeline", "mermaid", "excalidraw", "roadmap"].includes(slide.layout) ? (
            <div className="w-full h-full overflow-hidden relative" style={{ zIndex: 1 }}>
              <SlideRenderer slide={slide} template={activeTemplate} mode="edit" scale={1} />
            </div>
          ) : (
            elements.map((element) => (
              <CanvasElement
                key={element.id}
                element={element}
                isSelected={selectedId === element.id}
                canvasWidth={CANVAS_WIDTH}
                canvasHeight={CANVAS_HEIGHT}
                onSelect={() => handleSelect(element.id)}
                onUpdate={(updates) => handleUpdateElement(element.id, updates)}
              />
            ))
          )}
        </div>
      </div>

      {/* Properties panel */}
      <PropertiesPanel
        element={selectedElement}
        onUpdate={(updates) => {
          if (selectedId) handleUpdateElement(selectedId, { style: { ...selectedElement?.style, ...updates } });
        }}
      />
    </div>
  );
}
