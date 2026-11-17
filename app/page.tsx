"use client";

import { useState, useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { StoryPanel } from "./components/layout/StoryPanel";
import { EditorPanel } from "./components/layout/EditorPanel";
import { SlideThumbnails } from "./components/SlideThumbnails";
import { ResizablePanel } from "./components/layout/ResizablePanel";
import { TemplateView } from "./components/template/TemplateView";
import {
  exportHtmlPptx,
  type HtmlPptxExportMode,
} from "@/lib/htmlExport/exportHtmlPptx";
import { usePresentationStore } from "./stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "./stores/templateStore";

const CURRENT_PRES_KEY = "mybp-current-presentation";

export default function Home() {
  const [showTemplates, setShowTemplates] = useState(false);
  const { presentation, setPresentation } = usePresentationStore();
  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);
  const [isHydrated, setIsHydrated] = useState(false);

  // Restore presentation from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // Clean up duplicate entries from old buggy versions
      const listRaw = localStorage.getItem("mybp-presentations-list");
      if (listRaw) {
        try {
          const list = JSON.parse(listRaw) as Array<{ id: string; title: string; updatedAt: number; slideCount: number }>;
          const seen = new Set<string>();
          const cleaned = list.filter((p) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
          if (cleaned.length !== list.length) {
            localStorage.setItem("mybp-presentations-list", JSON.stringify(cleaned));
          }
        } catch { /* ignore */ }
      }

      const raw = localStorage.getItem(CURRENT_PRES_KEY);
      if (raw) {
        const savedPresentation = JSON.parse(raw) as import("./types/presentation").Presentation;
        if (savedPresentation && savedPresentation.id && Array.isArray(savedPresentation.slides) && savedPresentation.slides.length > 0) {
          setPresentation(savedPresentation);
        }
      }
    } catch {
      // Ignore restore errors
    }
    setIsHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save presentation to localStorage on every change (only after hydration)
  useEffect(() => {
    if (!presentation || typeof window === "undefined" || !isHydrated) return;
    try {
      localStorage.setItem(CURRENT_PRES_KEY, JSON.stringify(presentation));
      const listRaw = localStorage.getItem("mybp-presentations-list");
      const list: Array<{ id: string; title: string; updatedAt: number; slideCount: number }> = listRaw ? JSON.parse(listRaw) : [];
      const existingIndex = list.findIndex((p) => p.id === presentation.id);
      const entry = {
        id: presentation.id,
        title: presentation.title || "Sans titre",
        updatedAt: Date.now(),
        slideCount: presentation.slides.length,
      };
      if (existingIndex >= 0) {
        list[existingIndex] = entry;
      } else {
        list.unshift(entry);
      }
      localStorage.setItem("mybp-presentations-list", JSON.stringify(list));
      localStorage.setItem(`mybp-pres-${presentation.id}`, JSON.stringify(presentation));
    } catch {
      // Quota exceeded — silently fail
    }
  }, [presentation, isHydrated]);

  const handleExport = async (mode: HtmlPptxExportMode) => {
    if (!presentation) return;
    try {
      await exportHtmlPptx(presentation, template, { mode });
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  if (showTemplates) {
    return (
      <AppShell
        onExport={handleExport}
        onOpenTemplates={() => setShowTemplates(false)}
      >
        <TemplateView onClose={() => setShowTemplates(false)} />
      </AppShell>
    );
  }

  return (
    <AppShell
      onExport={handleExport}
      onOpenTemplates={() => setShowTemplates(true)}
    >
      <div className="flex h-full">
        {/* Left: Storytelling */}
        <ResizablePanel
          defaultWidth={320}
          minWidth={250}
          maxWidth={500}
          side="left"
          storageKey="mybp-panel-left"
        >
          <StoryPanel />
        </ResizablePanel>

        {/* Center: Editor */}
        <div className="flex-1 min-w-0">
          <EditorPanel />
        </div>

        {/* Right: Thumbnails */}
        <ResizablePanel
          defaultWidth={220}
          minWidth={180}
          maxWidth={600}
          side="right"
          storageKey="mybp-panel-right"
        >
          <SlideThumbnails />
        </ResizablePanel>
      </div>
    </AppShell>
  );
}
