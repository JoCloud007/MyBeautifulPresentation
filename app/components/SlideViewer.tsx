"use client";

import { useEffect, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePresentationStore } from "../stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import { SlideEngine } from "./SlideEngine";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function SlideViewer() {
  const {
    presentation,
    currentSlideIndex,
    setCurrentSlide,
  } = usePresentationStore();

  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);
  const [zoom, setZoom] = useState(1);
  const [showNotes, setShowNotes] = useState(false);

  const slide = presentation?.slides[currentSlideIndex];
  const totalSlides = presentation?.slides.length || 0;

  const goNext = useCallback(() => {
    if (currentSlideIndex < totalSlides - 1) {
      setCurrentSlide(currentSlideIndex + 1);
    }
  }, [currentSlideIndex, totalSlides, setCurrentSlide]);

  const goPrev = useCallback(() => {
    if (currentSlideIndex > 0) {
      setCurrentSlide(currentSlideIndex - 1);
    }
  }, [currentSlideIndex, setCurrentSlide]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Home") {
        e.preventDefault();
        setCurrentSlide(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setCurrentSlide(totalSlides - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, setCurrentSlide, totalSlides]);

  if (!presentation) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Aucune présentation
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-muted/20">
      {/* Navigation & info bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={currentSlideIndex === 0}
            onClick={goPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted text-xs">
            <Monitor className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium tabular-nums min-w-[48px] text-center">
              {currentSlideIndex + 1} / {totalSlides}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={currentSlideIndex >= totalSlides - 1}
            onClick={goNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          {slide && (
            <span className="text-[11px] text-muted-foreground capitalize hidden sm:inline">
              {slide.layout.replace(/-/g, " ")}
            </span>
          )}
          <div className="h-4 w-px bg-border mx-1 hidden sm:block" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            disabled={zoom <= 0.5}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[11px] text-muted-foreground w-10 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
            disabled={zoom >= 1.5}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", zoom === 1 && "text-primary")}
            onClick={() => setZoom(1)}
          >
            <Maximize className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Main preview area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-4 md:p-6 relative">
          <AnimatePresence mode="wait">
            {slide ? (
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, x: 20, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -20, scale: 0.98 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="w-full max-w-4xl aspect-video rounded-xl shadow-2xl overflow-hidden border"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center",
                  borderColor: template.colors.border,
                }}
              >
                <SlideEngine slide={slide} template={template} />
              </motion.div>
            ) : (
              <div className="text-muted-foreground text-sm">
                Aucune slide
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Notes panel */}
        {slide?.notes && (
          <div className="border-t bg-background/80 backdrop-blur px-4 py-2">
            <button
              onClick={() => setShowNotes(!showNotes)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <span className="font-medium">Notes</span>
              <span className="text-muted-foreground/60">
                {showNotes ? "(masquer)" : "(afficher)"}
              </span>
            </button>
            <AnimatePresence>
              {showNotes && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">
                    {slide.notes}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
