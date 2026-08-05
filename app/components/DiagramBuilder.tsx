"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Undo, RotateCcw, Save, Plus, Trash2, Loader2, Wand2 } from "lucide-react";
import { usePresentationStore } from "../stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import { useLlmStore } from "../stores/llmStore";
import { callLlmChat } from "@/lib/llm";
import { motion, AnimatePresence } from "framer-motion";

const MERMAID_TEMPLATES = [
  {
    name: "Flowchart simple",
    code: `flowchart LR
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]`,
  },
  {
    name: "Flowchart vertical",
    code: `flowchart TD
    A[Start] --> B[Process]
    B --> C{Decision?}
    C -->|Yes| D[End]
    C -->|No| E[Loop back]
    E --> B`,
  },
  {
    name: "Sequence diagram",
    code: `sequenceDiagram
    participant User
    participant App
    participant API
    User->>App: Open app
    App->>API: Fetch data
    API-->>App: Return data
    App-->>User: Display results`,
  },
  {
    name: "Class diagram",
    code: `classDiagram
    class User {
      +String name
      +String email
      +login()
    }
    class Order {
      +int id
      +Date date
      +placeOrder()
    }
    User "1" --> "*" Order : places`,
  },
  {
    name: "State diagram",
    code: `stateDiagram-v2
    [*] --> Idle
    Idle --> Running : start
    Running --> Paused : pause
    Paused --> Running : resume
    Running --> Done : finish
    Done --> [*]`,
  },
  {
    name: "ER diagram",
    code: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        string name
        string email
    }
    ORDER {
        int id
        date created_at
    }`,
  },
  {
    name: "Mindmap",
    code: `mindmap
  root((Idea))
    Sub-idea 1
      Detail A
      Detail B
    Sub-idea 2
      Detail C
    Sub-idea 3`,
  },
  {
    name: "Pie chart",
    code: `pie title Distribution
    "Category A" : 40
    "Category B" : 30
    "Category C" : 20
    "Category D" : 10`,
  },
];

export function DiagramBuilder() {
  const {
    presentation,
    currentSlideIndex,
    addSlide,
    updateSlide,
  } = usePresentationStore();

  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);
  const colors = template.colors;

  const currentSlide = presentation?.slides[currentSlideIndex];
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("Diagramme");

  const historyRef = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const { config, isAvailable } = useLlmStore();
  const [storyInput, setStoryInput] = useState("");
  const [isGeneratingLocal, setIsGeneratingLocal] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [evolveInput, setEvolveInput] = useState("");
  const [isEvolving, setIsEvolving] = useState(false);
  const [evolveError, setEvolveError] = useState<string | null>(null);
  const evolveAbortRef = useRef<AbortController | null>(null);

  // Load from current slide
  useEffect(() => {
    if (currentSlide?.layout === "mermaid") {
      setCode(currentSlide.content || "");
      setTitle(currentSlide.title || "Diagramme");
    } else {
      setCode("");
      setTitle("Diagramme");
    }
  }, [currentSlide?.id]);

  // Live sync to slide
  useEffect(() => {
    if (!currentSlide || currentSlide.layout !== "mermaid") return;

    const timer = setTimeout(() => {
      updateSlide(currentSlideIndex, {
        ...currentSlide,
        content: code,
        title,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [code, title, currentSlide, currentSlideIndex, updateSlide]);

  const saveHistory = useCallback(() => {
    historyRef.current.push(code);
    if (historyRef.current.length > 20) historyRef.current.shift();
    setCanUndo(true);
  }, [code]);

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (prev !== undefined) {
      setCode(prev);
    }
    setCanUndo(historyRef.current.length > 0);
  }, []);

  const handleReset = useCallback(() => {
    setCode("");
    setTitle("Diagramme");
    historyRef.current = [];
    setCanUndo(false);
  }, []);

  const handleInsert = useCallback(() => {
    if (!code.trim()) return;

    if (currentSlide?.layout === "mermaid") {
      updateSlide(currentSlideIndex, {
        ...currentSlide,
        layout: "mermaid",
        title: title || "Diagramme",
        content: code,
      });
    } else {
      addSlide({
        layout: "mermaid",
        title: title || "Diagramme",
        content: code,
      });
    }
  }, [code, title, currentSlide, currentSlideIndex, addSlide, updateSlide]);

  const applyTemplate = useCallback((templateCode: string) => {
    saveHistory();
    setCode(templateCode);
  }, [saveHistory]);

  const handleGenerateFromStory = useCallback(async () => {
    if (!storyInput.trim() || !isAvailable) return;

    setGenerateError(null);
    setIsGeneratingLocal(true);
    abortRef.current = new AbortController();

    try {
      const { buildMermaidPrompt } = await import("@/lib/llm");
      const messages = buildMermaidPrompt(storyInput, config, template);
      const raw = await callLlmChat(config, messages, abortRef.current.signal);

      // Try to extract mermaid code from the response
      let mermaidCode = raw.trim();

      // Look for fenced code blocks
      const codeBlockMatch = raw.match(/```(?:mermaid)?\n?([\s\S]*?)```/);
      if (codeBlockMatch) {
        mermaidCode = codeBlockMatch[1].trim();
      } else {
        // Try to find mermaid keyword at start
        const lines = raw.split("\n");
        const startIdx = lines.findIndex((l) =>
          /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|mindmap|pie|gantt|journey|gitGraph|C4Context|requirementDiagram|sankey)/i.test(l.trim())
        );
        if (startIdx >= 0) {
          mermaidCode = lines.slice(startIdx).join("\n").trim();
        }
      }

      if (mermaidCode) {
        saveHistory();
        setCode(mermaidCode);
      } else {
        setGenerateError("Le LLM n'a pas généré de code Mermaid valide.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setGenerateError(`Erreur : ${(err as Error).message}`);
      }
    } finally {
      setIsGeneratingLocal(false);
      abortRef.current = null;
    }
  }, [storyInput, isAvailable, config, template, saveHistory]);

  const handleEvolve = useCallback(async () => {
    if (!evolveInput.trim() || !isAvailable || !code.trim()) return;

    setEvolveError(null);
    setIsEvolving(true);
    evolveAbortRef.current = new AbortController();

    try {
      const { buildMermaidEvolvePrompt } = await import("@/lib/llm");
      const messages = buildMermaidEvolvePrompt(code, evolveInput, config, template);
      const raw = await callLlmChat(config, messages, evolveAbortRef.current.signal);

      let mermaidCode = raw.trim();
      const codeBlockMatch = raw.match(/```(?:mermaid)?\n?([\s\S]*?)```/);
      if (codeBlockMatch) {
        mermaidCode = codeBlockMatch[1].trim();
      } else {
        const lines = raw.split("\n");
        const startIdx = lines.findIndex((l) =>
          /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|mindmap|pie|gantt|journey|gitGraph|C4Context|requirementDiagram|sankey)/i.test(l.trim())
        );
        if (startIdx >= 0) {
          mermaidCode = lines.slice(startIdx).join("\n").trim();
        }
      }

      if (mermaidCode) {
        saveHistory();
        setCode(mermaidCode);
      } else {
        setEvolveError("Le LLM n'a pas généré de code Mermaid valide.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setEvolveError(`Erreur : ${(err as Error).message}`);
      }
    } finally {
      setIsEvolving(false);
      evolveAbortRef.current = null;
    }
  }, [evolveInput, isAvailable, code, config, template, saveHistory]);

  const canInsert = code.trim().length > 0;

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: colors.border }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Éditeur de Schémas</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            Mermaid
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: templates + editor */}
        <div className="flex flex-col h-full flex-1 overflow-hidden">
          {/* Templates */}
          <div
            className="px-4 py-2.5 border-b shrink-0"
            style={{ borderColor: colors.border }}
          >
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">
              Templates
            </Label>
            <ScrollArea className="w-full">
              <div className="flex gap-1.5 pb-1">
                {MERMAID_TEMPLATES.map((t) => (
                  <Button
                    key={t.name}
                    size="xs"
                    variant="outline"
                    onClick={() => applyTemplate(t.code)}
                    className="text-[10px] whitespace-nowrap shrink-0"
                  >
                    {t.name}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Storytelling generation */}
          <div
            className="px-4 py-2.5 border-b shrink-0 space-y-1.5"
            style={{ borderColor: colors.border }}
          >
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Génération par storytelling
            </Label>
            <Textarea
              value={storyInput}
              onChange={(e) => setStoryInput(e.target.value)}
              placeholder="Décrivez le schéma que vous voulez générer. Ex: 'Un flowchart montrant le processus d'inscription utilisateur avec validation email et création de profil'"
              className="text-xs min-h-[50px] resize-none"
              disabled={isGeneratingLocal}
            />
            <Button
              size="sm"
              onClick={handleGenerateFromStory}
              disabled={!storyInput.trim() || !isAvailable || isGeneratingLocal}
              className="w-full gap-1.5"
            >
              {isGeneratingLocal ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {isGeneratingLocal ? "Génération..." : "Générer le schéma"}
            </Button>
            {generateError && (
              <div className="text-[11px] text-destructive bg-destructive/10 rounded p-1.5">
                {generateError}
              </div>
            )}
          </div>

          {/* Evolve by prompt */}
          <div
            className="px-4 py-2.5 border-b shrink-0 space-y-1.5"
            style={{ borderColor: colors.border }}
          >
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Modifier par prompt
            </Label>
            <Textarea
              value={evolveInput}
              onChange={(e) => setEvolveInput(e.target.value)}
              placeholder="Décrivez les modifications à apporter au schéma actuel. Ex: 'Ajouter un nœud de validation entre l'inscription et la confirmation'"
              className="text-xs min-h-[50px] resize-none"
              disabled={isEvolving}
            />
            <Button
              size="sm"
              onClick={handleEvolve}
              disabled={!evolveInput.trim() || !isAvailable || isEvolving || !code.trim()}
              className="w-full gap-1.5"
            >
              {isEvolving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {isEvolving ? "Modification..." : "Modifier le schéma"}
            </Button>
            {evolveError && (
              <div className="text-[11px] text-destructive bg-destructive/10 rounded p-1.5">
                {evolveError}
              </div>
            )}
          </div>

          {/* Title input */}
          <div className="px-4 py-2 border-b shrink-0 space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Titre du diagramme
            </Label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm px-2 py-1 rounded border bg-background"
              placeholder="Titre du diagramme..."
            />
          </div>

          {/* Code editor */}
          <div className="flex-1 px-4 py-3 overflow-hidden flex flex-col">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
              Code Mermaid
            </Label>
            <Textarea
              value={code}
              onChange={(e) => {
                saveHistory();
                setCode(e.target.value);
              }}
              placeholder={`Exemple:
flowchart TD
    A[Start] --> B[Process]
    B --> C{Decision?}
    C -->|Yes| D[End]
    C -->|No| E[Retry]`}
              className="flex-1 text-xs font-mono resize-none min-h-0"
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-t flex-shrink-0"
        style={{ borderColor: colors.border }}
      >
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleUndo}
            disabled={!canUndo}
          >
            <Undo className="size-3.5 mr-1" />
            Annuler
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            disabled={!code}
          >
            <RotateCcw className="size-3.5 mr-1" />
            Réinitialiser
          </Button>
        </div>

        <Button
          size="sm"
          onClick={handleInsert}
          disabled={!canInsert}
        >
          <Save className="size-3.5 mr-1" />
          {currentSlide?.layout === "mermaid" ? "Modifier la slide" : "Insérer dans la présentation"}
        </Button>
      </div>
    </div>
  );
}
