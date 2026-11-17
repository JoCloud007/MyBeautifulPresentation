"use client";

import { useState } from "react";
import { useTemplates } from "@/app/hooks/useTemplates";
import { StoryPanel } from "@/app/components/layout/StoryPanel";
import { MiniSlideRenderer } from "@/app/components/SlideRenderer";
import { builtInTemplates, useTemplateStore } from "@/app/stores/templateStore";
import type { Slide } from "@/app/types/presentation";
import { BrandImportWizard } from "@/app/components/brand/BrandImportWizard";

/**
 * Slide d'exemple rendue en aperçu dans la galerie de thèmes. Elle sert
 * uniquement à montrer le rendu réel de chaque thème (même moteur que
 * l'éditeur), pas à être éditée.
 */
const THEME_PREVIEW_SLIDE: Slide = {
  id: "theme-preview",
  title: "Une croissance pensée pour durer",
  content:
    "Notre modèle repose sur trois piliers complémentaires, construits pour résister aux cycles du marché.",
  layout: "title-content",
};

interface TemplateViewProps {
  onClose: () => void;
}

export function TemplateView({ onClose }: TemplateViewProps) {
  const { templates, isLoading, mutate } = useTemplates();
  const [showImport, setShowImport] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const { activeTemplateId, setActiveTemplate } = useTemplateStore();
  const activeTemplate =
    builtInTemplates[activeTemplateId as keyof typeof builtInTemplates] ??
    builtInTemplates.corporate;

  // L'assistant occupe tout l'écran : c'est un parcours en 4 étapes, pas un
  // panneau latéral.
  if (showWizard) {
    return (
      <BrandImportWizard
        onClose={() => {
          setShowWizard(false);
          setShowImport(false);
          // Rafraîchit la galerie pour faire apparaître le template créé.
          void mutate();
        }}
      />
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Storytelling for template creation */}
      <div className="w-[320px] flex-shrink-0">
        <div className="flex flex-col h-full bg-white border-r border-slate-200">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <div className="text-sm font-bold text-slate-900">Créer un Template</div>
            <div className="text-xs text-slate-500">Décrivez votre template via conversation</div>
          </div>
          <div className="flex-1 overflow-hidden">
            <StoryPanel />
          </div>
        </div>
      </div>

      {/* Right: Gallery + Preview */}
      <div className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Templates</h1>
            <p className="text-sm text-slate-500">Gérez vos templates et importez-en de nouveaux</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowImport(!showImport)}
              className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Importer
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800"
            >
              Retour
            </button>
          </div>
        </div>

        {/* Import area — remplacée par l'assistant de charte.
            Les deux tuiles précédentes n'avaient aucun gestionnaire : elles
            n'importaient rien. L'assistant couvre réellement CSS/PPTX/PDF/SVG. */}
        {showImport && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-sm font-semibold text-slate-700 mb-1">
              Importer une charte client
            </div>
            <p className="text-xs text-slate-500 mb-3">
              CSS, PPTX, PDF de guidelines, logo et pictogrammes → couleurs, polices et
              template prêts à l&apos;emploi.
            </p>
            <button
              type="button"
              onClick={() => setShowWizard(true)}
              className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800"
            >
              Ouvrir l&apos;assistant de charte
            </button>
          </div>
        )}

        {/* Built-in themes — rendus live avec le vrai moteur, sélectionnables */}
        <div>
          <div className="text-sm font-semibold text-slate-700 mb-1">
            Thèmes intégrés
            <span className="text-xs text-slate-400 font-normal ml-2">
              {Object.keys(builtInTemplates).length} thème(s) — cliquez pour appliquer
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Aperçu réel de chaque thème sur une slide d&apos;exemple.
          </p>
          <div className="grid grid-cols-3 gap-4">
            {Object.values(builtInTemplates).map((theme) => {
              const isActive = activeTemplate.id === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => setActiveTemplate(theme.id)}
                  className={`text-left rounded-lg overflow-hidden border-2 transition-all hover:shadow-md ${
                    isActive
                      ? "border-slate-900 ring-2 ring-slate-900/20"
                      : "border-slate-200 hover:border-slate-400"
                  }`}
                >
                  <div
                    className="relative w-full bg-white overflow-hidden"
                    style={{ aspectRatio: "16/9" }}
                  >
                    <div className="absolute inset-0">
                      <MiniSlideRenderer
                        slide={THEME_PREVIEW_SLIDE}
                        template={theme}
                      />
                    </div>
                  </div>
                  <div className="px-3 py-2 bg-white border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {theme.name}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-900 bg-slate-100 rounded px-1.5 py-0.5">
                          Actif
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {theme.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Gallery */}
        <div>
          <div className="text-sm font-semibold text-slate-700 mb-3">
            Templates sauvegardés
            <span className="text-xs text-slate-400 font-normal ml-2">
              {isLoading ? "Chargement..." : `${templates?.length || 0} template(s)`}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {templates?.map((template: { id: string; name: string; source?: string; colors?: { primary?: string } }) => (
              <div
                key={template.id}
                className="p-4 bg-white border border-slate-200 rounded-lg text-center hover:shadow-md transition-shadow relative group"
              >
                <button
                  onClick={() => {
                    if (confirm(`Supprimer le template "${template.name}" ?`)) {
                      fetch(`/api/templates/${template.id}`, { method: "DELETE" })
                        .then((res) => {
                          if (!res.ok) throw new Error("Échec de la suppression");
                          window.location.reload();
                        })
                        .catch((err) => alert(err.message));
                    }
                  }}
                  className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
                <div
                  className="w-10 h-10 rounded-lg mx-auto mb-2"
                  style={{ backgroundColor: template.colors?.primary || "#64748b" }}
                />
                <div className="text-sm font-semibold text-slate-900">{template.name}</div>
                <div className="text-xs text-slate-500 mt-1 capitalize">{template.source || "custom"}</div>
              </div>
            ))}
            {(!templates || templates.length === 0) && !isLoading && (
              <div className="col-span-3 p-8 text-center text-slate-400 text-sm">
                Aucun template sauvegardé. Créez-en un via le storytelling ou importez-en un.
              </div>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-slate-700">Aperçu du template</div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200">
                Modifier
              </button>
              <button className="px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-medium hover:bg-slate-800">
                💾 Sauvegarder
              </button>
            </div>
          </div>
          <div className="h-48 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center">
            <div className="text-center">
              <div className="text-lg font-bold text-slate-400">Nouveau Template</div>
              <div className="text-sm text-slate-400 mt-1">Généré via storytelling AI</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
