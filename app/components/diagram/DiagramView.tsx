"use client";

import { useState, useCallback } from "react";
import { usePresentationStore } from "@/app/stores/presentationStore";
import { SlideElement } from "@/app/types/presentation";
import { useLlmStore } from "@/app/stores/llmStore";
import { buildMermaidPrompt, buildExcalidrawPrompt, callLlmChat } from "@/lib/llm";
import { MermaidEngine } from "@/app/components/MermaidEngine";
import { ExcalidrawEngine } from "@/app/components/ExcalidrawEngine";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Save } from "lucide-react";

const DIAGRAM_TYPES = [
  { id: "mermaid", label: "Mermaid" },
  { id: "excalidraw", label: "Excalidraw" },
];

const DEFAULT_MERMAID = `flowchart TD
    A[Démarrage] --> B{Decision}
    B -->|Oui| C[Action 1]
    B -->|Non| D[Action 2]
    C --> E[Fin]
    D --> E`;

export function DiagramView() {
  const [activeType, setActiveType] = useState("mermaid");
  const [code, setCode] = useState(DEFAULT_MERMAID);
  const [story, setStory] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { config } = useLlmStore();
  const { currentSlideIndex, updateSlide, addSlideElement } = usePresentationStore();

  const handleGenerate = useCallback(async () => {
    if (!story.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);

    try {
      const messages =
        activeType === "mermaid"
          ? buildMermaidPrompt(story, config)
          : buildExcalidrawPrompt(story, config);

      const content = await callLlmChat(config, messages);

      if (activeType === "mermaid") {
        // Extract mermaid code (strip markdown fences if present)
        const clean = content
          .replace(/^```mermaid\n?/, "")
          .replace(/\n?```$/, "")
          .trim();
        setCode(clean || content);
      } else {
        // Excalidraw returns JSON with elements
        try {
          const parsed = JSON.parse(content);
          if (parsed.elements) {
            setCode(JSON.stringify(parsed, null, 2));
          } else {
            setCode(content);
          }
        } catch {
          setCode(content);
        }
      }
    } catch (err) {
      setError((err as Error).message || "Erreur lors de la génération");
    } finally {
      setIsGenerating(false);
    }
  }, [story, isGenerating, activeType, config]);

  const handleInsert = () => {
    if (!code.trim()) return;
    const slide = usePresentationStore.getState().presentation?.slides[currentSlideIndex];
    if (!slide) return;
    const element: SlideElement = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      type: "diagram",
      subtype: activeType,
      x: 10,
      y: 20,
      w: 80,
      h: 60,
      content: code,
    };
    addSlideElement(currentSlideIndex, element);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Type selector */}
      <div className="flex gap-2 p-4 border-b border-slate-200 items-center">
        {DIAGRAM_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => setActiveType(type.id)}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${
              activeType === type.id
                ? "bg-slate-900 text-white"
                : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Split pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Storytelling + Definition */}
        <div className="w-1/2 border-r border-slate-200 flex flex-col">
          {/* Storytelling zone */}
          <div className="px-4 py-2 border-b border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>Storytelling</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={isGenerating || !story.trim()}
              className="text-xs h-7"
            >
              {isGenerating ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              Générer
            </Button>
          </div>
          <div className="p-3">
            <Textarea
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder={`Décrivez le diagramme que vous souhaitez générer...\nEx: Un flowchart montrant le processus de connexion utilisateur avec 2FA`}
              className="resize-none text-sm h-24"
              disabled={isGenerating}
            />
          </div>

          {error && (
            <div className="mx-3 mb-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
              {error}
            </div>
          )}

          {/* Definition zone */}
          <div className="px-4 py-2 border-y border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>Définition {activeType === "mermaid" ? "Mermaid" : "Excalidraw"}</span>
            <Button
              size="sm"
              onClick={handleInsert}
              disabled={!code.trim()}
              className="text-xs h-7"
            >
              <Save className="mr-1 h-3 w-3" />
              Insérer dans la slide
            </Button>
          </div>
          <div className="flex-1 p-3 flex flex-col gap-2">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs leading-relaxed text-slate-700 outline-none resize-none focus:border-slate-400"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Right: Preview */}
        <div className="w-1/2 flex flex-col">
          <div className="px-4 py-2 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-700">Aperçu</span>
          </div>
          <div className="flex-1 p-4 bg-slate-50 overflow-auto">
            {activeType === "mermaid" ? (
              <MermaidEngine code={code} />
            ) : (
              <div className="w-full h-full min-h-[300px]">
                <ExcalidrawEngine data={code} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
