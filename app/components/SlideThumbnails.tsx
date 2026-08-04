"use client";

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
  } = usePresentationStore();

  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);

  if (!presentation || presentation.slides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2">
        <span className="text-xs text-muted-foreground">Aucune slide</span>
        <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => addSlide()}>
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
                "group relative flex flex-col gap-1.5 p-2 rounded-lg border text-left transition-all",
                currentSlideIndex === index
                  ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                  : "border-border bg-card hover:bg-accent/50 hover:border-accent/50"
              )}
            >
              {/* Slide number badge */}
              <div className="absolute -top-1.5 -left-1.5 z-10">
                <span
                  className={cn(
                    "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shadow-sm",
                    currentSlideIndex === index
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {index + 1}
                </span>
              </div>

              {/* Mini slide preview - clickable */}
              <button
                onClick={() => setCurrentSlide(index)}
                className="w-full aspect-video rounded border overflow-hidden flex-shrink-0 transition-transform hover:scale-[1.02]"
                style={{
                  borderColor: template.colors.border,
                }}
              >
                <SlideEngine
                  slide={slide}
                  template={template}
                  scale={0.15}
                />
              </button>

              {/* Actions - visible on hover */}
              <div className="flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] text-muted-foreground capitalize truncate max-w-[80px]">
                  {slide.layout.replace(/-/g, " ")}
                </span>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateSlide(index);
                    }}
                    title="Dupliquer"
                  >
                    <Copy className="h-2.5 w-2.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSlide(index);
                    }}
                    title="Supprimer"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add slide button */}
      <div className="p-3 border-t">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs gap-1.5"
          onClick={() => addSlide()}
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter une slide
        </Button>
      </div>
    </div>
  );
}
