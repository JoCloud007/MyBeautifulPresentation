"use client";

import { SlideElement, SlideElementStyle } from "@/app/types/presentation";
import { usePresentationStore } from "@/app/stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "@/app/stores/templateStore";

interface PropertiesPanelProps {
  element: SlideElement | null;
  onUpdate: (style: Partial<SlideElementStyle>) => void;
}

export function PropertiesPanel({ element, onUpdate }: PropertiesPanelProps) {
  const { removeSlideElement, currentSlideIndex, presentation, updateSlide, updateSlideElement } = usePresentationStore();
  const themeTextColor = getActiveTemplate(useTemplateStore()).colors.foreground;
  const slide = presentation?.slides[currentSlideIndex];

  if (!element) {
    if (!slide) {
      return (
        <div className="h-10 flex items-center px-4 bg-white border-t border-slate-200 text-xs text-slate-400">
          Aucune slide sélectionnée
        </div>
      );
    }
    return (
      <div className="bg-white border-t border-slate-200 px-4 py-2">
        <div className="text-xs font-semibold text-slate-500 mb-2">Propriétés de la slide</div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-slate-500">Titre</label>
            <input
              type="text"
              value={slide.title || ""}
              onChange={(e) => updateSlide(currentSlideIndex, { title: e.target.value })}
              className="w-40 px-2 py-0.5 text-xs border rounded"
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-slate-500">Layout</label>
            <select
              value={slide.layout}
              onChange={(e) => updateSlide(currentSlideIndex, { layout: e.target.value as any })}
              className="text-xs border rounded px-1 py-0.5"
            >
              <option value="title">Titre</option>
              <option value="title-content">Titre + Contenu</option>
              <option value="content-only">Contenu seul</option>
              <option value="two-column">Deux colonnes</option>
              <option value="image-left">Image gauche</option>
              <option value="image-right">Image droite</option>
              <option value="timeline">Timeline</option>
              <option value="gantt">GANTT</option>
              <option value="mermaid">Mermaid</option>
              <option value="excalidraw">Excalidraw</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  const style = element.style || {};
  const isText = element.type === "text";
  const isShape = element.type === "shape";
  const isDiagram = element.type === "diagram";
  const isChronology = element.type === "chronology";
  const isImage = element.type === "image";
  const isPowerBi = element.type === "powerbi";

  return (
    <div className="bg-white border-t border-slate-200 px-4 py-2">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 capitalize">
          {element.type}
        </span>

        {(isText || isShape || isDiagram || isChronology || isPowerBi) && (
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-slate-500">Fond</label>
            <input
              type="color"
              value={style.backgroundColor && style.backgroundColor !== "transparent" ? style.backgroundColor : "#ffffff"}
              onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
              className="w-6 h-6 border rounded cursor-pointer"
            />
            <button
              onClick={() => onUpdate({ backgroundColor: "transparent" })}
              className={`text-[10px] px-1 py-0.5 border rounded cursor-pointer transition-colors ${
                style.backgroundColor === "transparent"
                  ? "bg-blue-500 text-white border-blue-500"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}
              title="Transparent"
            >
              T
            </button>
          </div>
        )}

        {isText && (
          <>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-slate-500">Police</label>
              <input
                type="text"
                value={style.fontFamily || "system-ui"}
                onChange={(e) => onUpdate({ fontFamily: e.target.value })}
                className="w-20 px-1 py-0.5 text-[10px] border rounded"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-slate-500">Taille</label>
              <input
                type="number"
                value={style.fontSize || 20}
                onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
                className="w-12 px-1 py-0.5 text-[10px] border rounded"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-slate-500">Couleur</label>
              <input
                type="color"
                value={style.color || themeTextColor}
                onChange={(e) => onUpdate({ color: e.target.value })}
                className="w-6 h-6 border rounded cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-slate-500">Align</label>
              <select
                value={style.textAlign || "left"}
                onChange={(e) => onUpdate({ textAlign: e.target.value as "left" | "center" | "right" })}
                className="text-[10px] border rounded px-1 py-0.5"
              >
                <option value="left">G</option>
                <option value="center">C</option>
                <option value="right">D</option>
              </select>
            </div>
          </>
        )}

        {isShape && (
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-slate-500">Radius</label>
            <input
              type="number"
              value={style.borderRadius || 0}
              onChange={(e) => onUpdate({ borderRadius: Number(e.target.value) })}
              className="w-12 px-1 py-0.5 text-[10px] border rounded"
            />
          </div>
        )}

        {isPowerBi && (
          <>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-slate-500">URL</label>
              <input
                type="text"
                value={(() => {
                  try { return (JSON.parse(element.content || "{}") as import("@/app/types/presentation").PowerBiConfig).embedUrl || ""; }
                  catch { return ""; }
                })()}
                onChange={(e) => {
                  try {
                    const config = JSON.parse(element.content || "{}") as import("@/app/types/presentation").PowerBiConfig;
                    updateSlideElement(currentSlideIndex, element.id, {
                      content: JSON.stringify({ ...config, embedUrl: e.target.value }),
                    });
                  } catch { /* ignore */ }
                }}
                placeholder="https://app.powerbi.com/..."
                className="w-40 px-1 py-0.5 text-[10px] border rounded"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-slate-500">Page</label>
              <input
                type="text"
                value={(() => {
                  try { return (JSON.parse(element.content || "{}") as import("@/app/types/presentation").PowerBiConfig).pageName || ""; }
                  catch { return ""; }
                })()}
                onChange={(e) => {
                  try {
                    const config = JSON.parse(element.content || "{}") as import("@/app/types/presentation").PowerBiConfig;
                    updateSlideElement(currentSlideIndex, element.id, {
                      content: JSON.stringify({ ...config, pageName: e.target.value || undefined }),
                    });
                  } catch { /* ignore */ }
                }}
                placeholder="ReportSection1"
                className="w-24 px-1 py-0.5 text-[10px] border rounded"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-slate-500">Titre</label>
              <input
                type="text"
                value={(() => {
                  try { return (JSON.parse(element.content || "{}") as import("@/app/types/presentation").PowerBiConfig).title || ""; }
                  catch { return ""; }
                })()}
                onChange={(e) => {
                  try {
                    const config = JSON.parse(element.content || "{}") as import("@/app/types/presentation").PowerBiConfig;
                    updateSlideElement(currentSlideIndex, element.id, {
                      content: JSON.stringify({ ...config, title: e.target.value }),
                    });
                  } catch { /* ignore */ }
                }}
                placeholder="Titre"
                className="w-24 px-1 py-0.5 text-[10px] border rounded"
              />
            </div>
            <span className="text-[10px] text-slate-400 capitalize">
              {(() => {
                try { return (JSON.parse(element.content || "{}") as import("@/app/types/presentation").PowerBiConfig).mode || ""; }
                catch { return ""; }
              })()}
            </span>
          </>
        )}

        {isImage && (
          <>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-slate-500">URL</label>
              <input
                type="text"
                value={element.content || ""}
                onChange={(e) => updateSlideElement(currentSlideIndex, element.id, { content: e.target.value })}
                placeholder="https://..."
                className="w-32 px-1 py-0.5 text-[10px] border rounded"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-slate-500">Fichier</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const dataUrl = ev.target?.result as string;
                    if (dataUrl) updateSlideElement(currentSlideIndex, element.id, { content: dataUrl });
                  };
                  reader.readAsDataURL(file);
                }}
                className="text-[10px]"
              />
            </div>
          </>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => removeSlideElement(currentSlideIndex, element.id)}
            className="px-2 py-0.5 text-[10px] text-red-600 border border-red-200 rounded hover:bg-red-50 cursor-pointer transition-colors"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
