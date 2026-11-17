"use client";

import { usePresentationStore } from "../stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import { SlideCanvas } from "./canvas/SlideCanvas";

interface SlideEditorProps {
  onOpenBuilder?: () => void;
}

export function SlideEditor({}: SlideEditorProps) {
  const { presentation, currentSlideIndex } = usePresentationStore();
  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);

  const slide = presentation?.slides[currentSlideIndex];

  if (!slide) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400">
        Aucune slide sélectionnée
      </div>
    );
  }

  return (
    <div className="h-full">
      <SlideCanvas slide={slide} slideIndex={currentSlideIndex} template={template} />
    </div>
  );
}
