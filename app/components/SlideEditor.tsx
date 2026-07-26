"use client";

import { usePresentationStore } from "../stores/presentationStore";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SlideLayout } from "../types/presentation";
import {
  Type,
  AlignLeft,
  LayoutTemplate,
  Columns,
  Image,
  FileText,
  Heading,
  StickyNote,
} from "lucide-react";

const layoutOptions: { value: SlideLayout; label: string; icon: React.ReactNode }[] = [
  { value: "title", label: "Titre", icon: <Heading className="w-3.5 h-3.5" /> },
  { value: "title-content", label: "Titre + Contenu", icon: <FileText className="w-3.5 h-3.5" /> },
  { value: "title-only", label: "Titre uniquement", icon: <Type className="w-3.5 h-3.5" /> },
  { value: "content-only", label: "Contenu uniquement", icon: <AlignLeft className="w-3.5 h-3.5" /> },
  { value: "two-column", label: "Deux colonnes", icon: <Columns className="w-3.5 h-3.5" /> },
  // eslint-disable-next-line jsx-a11y/alt-text
  { value: "image-left", label: "Image gauche", icon: <Image className="w-3.5 h-3.5" aria-hidden="true" /> },
  // eslint-disable-next-line jsx-a11y/alt-text
  { value: "image-right", label: "Image droite", icon: <Image className="w-3.5 h-3.5" aria-hidden="true" /> },
];

export function SlideEditor() {
  const {
    presentation,
    currentSlideIndex,
    updateSlide,
    setSlideLayout,
  } = usePresentationStore();

  const slide = presentation?.slides[currentSlideIndex];

  if (!slide) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Aucune slide sélectionnée
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Éditeur de slide
          </h2>
          <span className="text-xs text-muted-foreground">
            Slide {currentSlideIndex + 1} / {presentation?.slides.length}
          </span>
        </div>

        {/* Layout selector */}
        <div className="grid gap-2">
          <Label htmlFor="slide-layout" className="flex items-center gap-1.5">
            <LayoutTemplate className="w-3.5 h-3.5" />
            Mise en page
          </Label>
          <Select
            value={slide.layout}
            onValueChange={(value) => setSlideLayout(currentSlideIndex, value as SlideLayout)}
          >
            <SelectTrigger id="slide-layout" className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {layoutOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-sm">
                  <span className="flex items-center gap-2">
                    {opt.icon}
                    {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Title */}
        <div className="grid gap-2">
          <Label htmlFor="slide-title" className="flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5" />
            Titre
          </Label>
          <Input
            id="slide-title"
            value={slide.title}
            onChange={(e) =>
              updateSlide(currentSlideIndex, { title: e.target.value })
            }
            placeholder="Titre de la slide"
            className="text-sm"
          />
        </div>

        {/* Content */}
        <div className="grid gap-2">
          <Label htmlFor="slide-content" className="flex items-center gap-1.5">
            <AlignLeft className="w-3.5 h-3.5" />
            Contenu
          </Label>
          <Textarea
            id="slide-content"
            value={slide.content}
            onChange={(e) =>
              updateSlide(currentSlideIndex, { content: e.target.value })
            }
            placeholder="Contenu de la slide..."
            className="min-h-[120px] resize-none text-sm leading-relaxed"
          />
          {slide.layout === "two-column" && (
            <p className="text-[11px] text-muted-foreground">
              Utilisez le caractère <code className="bg-muted px-1 rounded">|</code> pour séparer les deux colonnes.
            </p>
          )}
        </div>

        {/* Notes */}
        <div className="grid gap-2">
          <Label htmlFor="slide-notes" className="flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" />
            Notes du présentateur
          </Label>
          <Textarea
            id="slide-notes"
            value={slide.notes || ""}
            onChange={(e) =>
              updateSlide(currentSlideIndex, { notes: e.target.value })
            }
            placeholder="Notes pour le présentateur..."
            className="min-h-[80px] resize-none text-sm leading-relaxed"
          />
        </div>
      </div>
    </ScrollArea>
  );
}
