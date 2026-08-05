"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import dynamic from "next/dynamic";
import { Save, RotateCcw } from "lucide-react";
import { usePresentationStore } from "../stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false }
);

const DEFAULT_SCENE = {
  elements: [],
  appState: {
    theme: "light" as const,
    viewBackgroundColor: "#ffffff",
  },
};

export function ExcalidrawBuilder() {
  const {
    presentation,
    currentSlideIndex,
    addSlide,
    updateSlide,
  } = usePresentationStore();

  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);
  const colors = template.colors;

  const currentSlide = presentation?.slides[currentSlideIndex];
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [title, setTitle] = useState("Schéma");
  const isInitializedRef = useRef(false);

  // Load from current slide
  useEffect(() => {
    if (currentSlide?.layout === "excalidraw") {
      setTitle(currentSlide.title || "Schéma");
      if (excalidrawAPI && currentSlide.content) {
        try {
          const parsed = JSON.parse(currentSlide.content);
          excalidrawAPI.updateScene({
            elements: parsed.elements || [],
            appState: { ...parsed.appState, theme: "light" as const },
          });
          isInitializedRef.current = true;
        } catch {
          excalidrawAPI.updateScene({
            elements: [],
            appState: { theme: "light" as const, viewBackgroundColor: "#ffffff" },
          });
        }
      }
    } else {
      setTitle("Schéma");
      isInitializedRef.current = false;
    }
  }, [currentSlide?.id, excalidrawAPI]);

  // Initialize empty scene when no slide data
  useEffect(() => {
    if (excalidrawAPI && !isInitializedRef.current) {
      excalidrawAPI.updateScene({
        elements: [],
        appState: { theme: "light" as const, viewBackgroundColor: "#ffffff" },
      });
      isInitializedRef.current = true;
    }
  }, [excalidrawAPI]);

  const handleReset = useCallback(() => {
    if (excalidrawAPI) {
      excalidrawAPI.updateScene({
        elements: [],
        appState: { theme: "light" as const, viewBackgroundColor: "#ffffff" },
      });
    }
    setTitle("Schéma");
  }, [excalidrawAPI]);

  const handleInsert = useCallback(() => {
    if (!excalidrawAPI) return;

    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const data = JSON.stringify({
      elements,
      appState: {
        theme: appState.theme,
        viewBackgroundColor: appState.viewBackgroundColor,
      },
    });

    if (currentSlide?.layout === "excalidraw") {
      updateSlide(currentSlideIndex, {
        ...currentSlide,
        layout: "excalidraw",
        title: title || "Schéma",
        content: data,
      });
    } else {
      addSlide({
        layout: "excalidraw",
        title: title || "Schéma",
        content: data,
      });
    }
  }, [excalidrawAPI, title, currentSlide, currentSlideIndex, addSlide, updateSlide]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: colors.border }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Éditeur de Schémas</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            Excalidraw
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: editor */}
        <div className="flex flex-col h-full flex-1 overflow-hidden">
          {/* Title input */}
          <div className="px-4 py-2 border-b shrink-0 space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Titre du schéma
            </Label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm px-2 py-1 rounded border bg-background"
              placeholder="Titre du schéma..."
            />
          </div>

          {/* Excalidraw canvas */}
          <div className="flex-1 overflow-hidden relative">
            <Excalidraw
              excalidrawAPI={(api) => setExcalidrawAPI(api)}
              initialData={DEFAULT_SCENE}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  saveToActiveFile: false,
                  saveAsImage: false,
                  export: false,
                  toggleTheme: false,
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-t flex-shrink-0"
        style={{ borderColor: colors.border }}
      >
        <Button size="sm" variant="ghost" onClick={handleReset}>
          <RotateCcw className="size-3.5 mr-1" />
          Réinitialiser
        </Button>

        <Button size="sm" onClick={handleInsert}>
          <Save className="size-3.5 mr-1" />
          {currentSlide?.layout === "excalidraw" ? "Modifier la slide" : "Insérer dans la présentation"}
        </Button>
      </div>
    </div>
  );
}
