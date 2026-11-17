"use client";

import { usePresentationStore } from "@/app/stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "@/app/stores/templateStore";
import { SlideRenderer, MiniSlideRenderer } from "@/app/components/SlideRenderer";

interface LivePreviewPanelProps {
  className?: string;
}

export function LivePreviewPanel({ className }: LivePreviewPanelProps) {
  const { presentation, currentSlideIndex, setCurrentSlide, addSlide, removeSlide } = usePresentationStore();
  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);
  const currentSlide = presentation?.slides?.[currentSlideIndex];
  const slides = presentation?.slides || [];

  return (
    <div className={`flex flex-col h-full bg-white border-l border-slate-200 ${className}`}>
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="text-sm font-bold text-slate-900">Aperçu Slide</div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
        {/* Main preview */}
        {currentSlide && (
          <div className="relative w-full bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" style={{ aspectRatio: "16/9" }}>
            <div className="absolute inset-0">
              <SlideRenderer slide={currentSlide} template={template} scale={0.5} />
            </div>
          </div>
        )}

        {/* Slide info */}
        {currentSlide && (
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="text-xs font-semibold text-slate-700 mb-1">Détails</div>
            <div className="text-xs text-slate-500">Layout: {currentSlide.layout}</div>
            <div className="text-xs text-slate-500">Slide {currentSlideIndex + 1} / {slides.length}</div>
          </div>
        )}

        {/* Thumbnails */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Toutes les slides
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  addSlide();
                  setCurrentSlide(slides.length);
                }}
                className="px-2 py-0.5 text-[10px] bg-slate-900 text-white rounded hover:bg-slate-800 cursor-pointer transition-colors"
                title="Ajouter une slide"
              >
                +
              </button>
              {slides.length > 1 && (
                <button
                  onClick={() => {
                    removeSlide(currentSlideIndex);
                    if (currentSlideIndex >= slides.length - 1) {
                      setCurrentSlide(Math.max(0, slides.length - 2));
                    }
                  }}
                  className="px-2 py-0.5 text-[10px] bg-red-50 text-red-600 rounded hover:bg-red-100 cursor-pointer transition-colors"
                  title="Supprimer la slide active"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {slides.map((slide, index) => (
              <div
                key={slide.id}
                onClick={() => setCurrentSlide(index)}
                className={`relative w-16 h-10 rounded border flex-shrink-0 cursor-pointer transition-all overflow-hidden ${
                  index === currentSlideIndex
                    ? "border-slate-900 ring-2 ring-slate-900"
                    : "border-slate-200 hover:border-slate-400"
                }`}
                title={slide.title}
              >
                <div className="absolute inset-0">
                  <MiniSlideRenderer slide={slide} template={template} />
                </div>
              </div>
            ))}
            {slides.length === 0 && (
              <div className="text-xs text-slate-400">Aucune slide</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
