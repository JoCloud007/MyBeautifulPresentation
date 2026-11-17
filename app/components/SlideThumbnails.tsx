"use client";

import { useState } from "react";
import { usePresentationStore } from "../stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import { SlideEngine } from "./SlideEngine";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  Copy,
} from "lucide-react";

export function SlideThumbnails() {
  const {
    presentation,
    currentSlideIndex,
    setCurrentSlide,
    addSlide,
    removeSlide,
    duplicateSlide,
    updateSlide,
  } = usePresentationStore();
  const [editingId, setEditingId] = useState<string | null>(null);

  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);

  if (!presentation || presentation.slides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2">
        <span className="text-xs text-white/40">Aucune slide</span>
        <Button variant="outline" size="sm" className="text-xs gap-1 bg-white/5 border-white/10 text-[#e2e8f0] hover:bg-white/10 hover:text-white" onClick={() => addSlide()}>
          <Plus className="h-3 w-3" />
          Ajouter
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 p-3">
          {presentation.slides.map((slide, index) => (
            <div
              key={slide.id}
              className={cn(
                "group relative rounded-lg border text-left transition-all",
                currentSlideIndex === index
                  ? "border-[#6366f1]/60 bg-[#6366f1]/5"
                  : "border-white/5 bg-transparent hover:border-white/10"
              )}
            >
              {/* Mini slide preview - clickable. The inner box keeps the slide's
                  16:9 ratio; the slide number lives in the actions row so it no
                  longer steals vertical space (which squashed the thumbnail). */}
              <button
                onClick={() => setCurrentSlide(index)}
                data-testid={`slide-thumb-${index}`}
                className="block w-full rounded-md p-1.5 pt-1.5"
              >
                <div className="w-full aspect-video rounded overflow-hidden border border-white/5">
                  <SlideEngine
                    slide={slide}
                    template={template}
                    scale={0.15}
                  />
                </div>
              </button>

              {/* Actions */}
              <div className="flex items-center justify-between px-2 pb-1.5 gap-1">
                <span className="text-[9px] font-medium text-white/30 tabular-nums">
                  {index + 1}
                </span>
                {editingId === slide.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={slide.title || ""}
                    onChange={(e) => updateSlide(index, { title: e.target.value })}
                    onBlur={() => setEditingId(null)}
                    onKeyDown={(e) => { if (e.key === "Enter") setEditingId(null); }}
                    className="text-[9px] bg-white/10 text-white/70 rounded px-1 py-0.5 outline-none border border-white/20 w-20"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(slide.id);
                    }}
                    className="text-[9px] text-white/30 hover:text-white/60 truncate max-w-[80px] text-left cursor-pointer"
                    title="Cliquer pour renommer"
                  >
                    {slide.title || "Sans titre"}
                  </button>
                )}
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 text-white/40 hover:text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateSlide(index);
                    }}
                    title="Dupliquer"
                  >
                    <Copy className="h-2 w-2" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 text-white/40 hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSlide(index);
                    }}
                    title="Supprimer"
                  >
                    <Trash2 className="h-2 w-2" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add slide button */}
      <div className="p-3">
        <button
          className="w-full flex items-center justify-center py-2 rounded-lg border border-dashed border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors text-xs"
          onClick={() => addSlide()}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
