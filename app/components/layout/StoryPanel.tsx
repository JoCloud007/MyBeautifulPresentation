"use client";

import { useState, useCallback, useRef } from "react";
import { usePresentationStore } from "@/app/stores/presentationStore";
import { useLlmStore } from "@/app/stores/llmStore";
import { useTemplateStore, getActiveTemplate } from "@/app/stores/templateStore";
import {
  buildStorytellingPrompt,
  parseLlmSlidesResponse,
  streamLlmChat,
  normalizeLayout,
  callLlmChat,
  buildStoryChatPrompt,
  parseStoryChatResponse,
  buildDeckEditPrompt,
  parseDeckEditResponse,
} from "@/lib/llm";
import type { DeckOperation } from "@/lib/deckEdit";
import { Presentation, SlideLayout } from "@/app/types/presentation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";

const AGENT_PROFILES = [
  { id: "consultant", label: "Consultant", description: "Questions structurées pour un résultat professionnel" },
  { id: "creative", label: "Créatif", description: "Idées innovantes et storytelling original" },
  { id: "technical", label: "Technique", description: "Précision et détails techniques" },
  { id: "storyteller", label: "Storyteller", description: "Narration captivante et émotionnelle" },
];

const MODES = [
  { id: "direct", label: "Direct" },
  { id: "interview", label: "Interview" },
  { id: "brainstorm", label: "Brainstorm" },
  { id: "edit", label: "Édition" },
];

interface Message {
  role: "user" | "assistant";
  content: string;
  /** Recap of the operations applied to the deck (edit mode only). */
  kind?: "recap";
}

/** One readable line per applied operation, shown after an edit. */
function describeDeckOperations(operations: DeckOperation[]): string {
  return operations
    .map((operation) => {
      switch (operation.op) {
        case "add":
          return operation.slide.title
            ? `+ slide « ${operation.slide.title} »`
            : "+ slide ajoutée";
        case "update":
          return `~ slide ${operation.index + 1} mise à jour`;
        case "delete":
          return `− slide ${operation.index + 1} supprimée`;
        case "move":
          return `→ slide ${operation.fromIndex + 1} déplacée en position ${
            operation.toIndex + 1
          }`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(" · ");
}

function ChatThread({
  messages,
  isGenerating,
}: {
  messages: Message[];
  isGenerating: boolean;
}) {
  return (
    <>
      {messages.map((msg, index) => (
        <div
          key={index}
          className={`flex gap-2 items-start ${msg.role === "user" ? "flex-row-reverse" : ""}`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${
              msg.role === "assistant" ? "bg-slate-900" : "bg-blue-500"
            }`}
          >
            {msg.role === "assistant" ? "AI" : "Moi"}
          </div>
          <div
            className={`p-2.5 rounded-lg text-xs leading-relaxed max-w-[85%] ${
              msg.kind === "recap"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : msg.role === "assistant"
                  ? "bg-white border border-slate-200 text-slate-700 shadow-sm"
                  : "bg-blue-50 border border-blue-200 text-blue-800"
            }`}
          >
            {msg.kind === "recap" ? `✓ ${msg.content}` : msg.content}
          </div>
        </div>
      ))}
      {isGenerating && (
        <div className="flex gap-2 items-start">
          <div className="w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
            AI
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs text-slate-500 shadow-sm">
            <span className="animate-pulse">Réflexion en cours...</span>
          </div>
        </div>
      )}
    </>
  );
}

interface StoryPanelProps {
  className?: string;
}

/**
 * True when the store holds a presentation the user would lose by regenerating.
 * The store starts with a single untouched placeholder slide, which does not
 * count as a real deck.
 */
function hasRealDeck(presentation: Presentation | null): boolean {
  const slides = presentation?.slides ?? [];
  if (slides.length === 0) return false;
  if (slides.length > 1) return true;
  const [only] = slides;
  return !(
    only.title === "Titre de la présentation" &&
    only.content === "Sous-titre ou description"
  );
}

function greetingFor(profile: { label: string }, mode: string): string {
  const name = profile.label.toLowerCase();
  if (mode === "brainstorm") {
    return `Bonjour ! Je suis votre ${name}. Décrivez-moi le sujet de votre présentation et nous construirons le storytelling ensemble.`;
  }
  return `Bonjour ! Je suis votre ${name}. Quel est l'objectif de votre présentation ?`;
}

export function StoryPanel({ className }: StoryPanelProps) {
  const [activeMode, setActiveMode] = useState("direct");
  const [activeAgent, setActiveAgent] = useState("consultant");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: greetingFor(AGENT_PROFILES[0], "direct") },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [slideFocus, setSlideFocus] = useState(false);
  const [directStory, setDirectStory] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState("");
  const [editInput, setEditInput] = useState("");
  const [editMessages, setEditMessages] = useState<Message[]>([]);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmStoryReplace, setConfirmStoryReplace] = useState(false);

  const store = usePresentationStore();
  const { config } = useLlmStore();
  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);
  const abortRef = useRef<AbortController | null>(null);
  const existingDeck = hasRealDeck(store.presentation);

  const handleGenerateDirect = useCallback(async () => {
    if (!directStory.trim() || isGenerating) return;
    setIsGenerating(true);
    setGenError(null);
    setStreamedText("");

    try {
      const messages = buildStorytellingPrompt(directStory, config, template);
      abortRef.current = new AbortController();
      const generator = streamLlmChat(config, messages, abortRef.current.signal);
      let accumulated = "";
      let hasCommitted = false;

      for await (const chunk of generator) {
        accumulated += chunk;
        setStreamedText(accumulated);

        const parsed = parseLlmSlidesResponse(accumulated);
        if (parsed && parsed.slides.length > 0) {
          const slides = parsed.slides.map((s) => ({
            id: crypto.randomUUID(),
            title: s.title || "",
            content: s.content || "",
            layout: normalizeLayout(s.layout) as SlideLayout,
          }));

          if (!hasCommitted) {
            store.createFromStory(parsed.title || "Présentation", slides);
            hasCommitted = true;
            setGenError(null);
          }
        }
      }

      if (!hasCommitted) {
        setGenError("Aucune slide n'a pu être générée. Vérifiez votre storytelling.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setGenError((err as Error).message || "Erreur lors de la génération");
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [directStory, isGenerating, config, template, store]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isGenerating) return;

    const userMessage: Message = { role: "user", content: input };
    const history: Message[] = [...messages, userMessage];
    setMessages(history);
    setInput("");
    setIsGenerating(true);
    setGenError(null);

    try {
      const profile = AGENT_PROFILES.find((p) => p.id === activeAgent) || AGENT_PROFILES[0];
      const currentSlide = store.presentation?.slides?.[store.currentSlideIndex];
      const slideContext =
        slideFocus && currentSlide
          ? {
              index: store.currentSlideIndex,
              title: currentSlide.title,
              content: currentSlide.content,
              layout: currentSlide.layout,
            }
          : null;

      const promptMessages = buildStoryChatPrompt(
        history,
        { name: profile.label, description: profile.description },
        activeMode === "brainstorm" ? "brainstorm" : "interview",
        config,
        template,
        slideContext
      );
      abortRef.current = new AbortController();
      const raw = await callLlmChat(config, promptMessages, abortRef.current.signal);
      const result = parseStoryChatResponse(raw);

      const reply = result.reply || "Je n'ai pas pu générer de réponse. Reformulez votre demande.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);

      if (result.storytelling) {
        store.setStorytelling(result.storytelling);
      }

      if (result.slide && slideFocus && currentSlide) {
        store.updateSlide(store.currentSlideIndex, {
          title: result.slide.title,
          content: result.slide.content,
          layout: normalizeLayout(result.slide.layout) as SlideLayout,
        });
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setGenError((err as Error).message || "Erreur lors de la réponse de l'IA.");
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [input, isGenerating, messages, activeAgent, activeMode, slideFocus, config, template, store]);

  /**
   * Incremental editing: the model returns a plan of operations applied to the
   * current deck. The presentation is never regenerated from scratch here.
   */
  const handleDeckEdit = useCallback(async () => {
    const instruction = editInput.trim();
    const presentation = store.presentation;
    if (!instruction || isGenerating || !presentation) return;

    const userMessage: Message = { role: "user", content: instruction };
    const history: Message[] = [...editMessages, userMessage];
    setEditMessages(history);
    setEditInput("");
    setIsGenerating(true);
    setGenError(null);

    try {
      const profile = AGENT_PROFILES.find((p) => p.id === activeAgent) || AGENT_PROFILES[0];
      const deck = {
        title: presentation.title,
        storytelling: store.storytelling,
        slides: presentation.slides.map((slide, index) => ({
          index,
          title: slide.title,
          content: slide.content,
          layout: slide.layout,
        })),
      };

      const promptMessages = buildDeckEditPrompt(
        // Recap lines are UI notes, not conversation: never send them to the model.
        history.filter((message) => message.kind !== "recap"),
        deck,
        { name: profile.label, description: profile.description },
        config,
        template
      );

      abortRef.current = new AbortController();
      const raw = await callLlmChat(config, promptMessages, abortRef.current.signal);
      const result = parseDeckEditResponse(raw);

      const reply = result.reply || "Je n'ai pas pu préparer la modification.";
      const additions: Message[] = [{ role: "assistant", content: reply }];

      if (result.operations.length > 0) {
        const applied = store.applyDeckEdit(result.operations);
        if (applied.length > 0) {
          additions.push({
            role: "assistant",
            kind: "recap",
            content: describeDeckOperations(applied),
          });
        }
      }

      setEditMessages((prev) => [...prev, ...additions]);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setGenError((err as Error).message || "Erreur lors de la modification de la présentation.");
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [editInput, editMessages, isGenerating, activeAgent, config, template, store]);

  const handleGenerateSlidesFromStory = useCallback(async () => {
    const story = store.storytelling;
    if (!story.trim() || isGenerating) return;

    setIsGenerating(true);
    setGenError(null);

    try {
      const prompt = buildStorytellingPrompt(story, config, template);
      abortRef.current = new AbortController();
      const raw = await callLlmChat(config, prompt, abortRef.current.signal);
      const parsed = parseLlmSlidesResponse(raw);

      if (parsed && parsed.slides.length > 0) {
        const slides = parsed.slides.map((s) => ({
          id: crypto.randomUUID(),
          title: s.title || "",
          content: s.content || "",
          layout: normalizeLayout(s.layout) as SlideLayout,
        }));
        store.createFromStory(parsed.title || "Présentation", slides);
      } else {
        setGenError("La réponse du LLM n'a pas pu être analysée en slides.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setGenError((err as Error).message || "Erreur lors de la génération des slides.");
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [store, isGenerating, config, template]);

  const handleModeChange = useCallback(
    (modeId: string) => {
      setActiveMode(modeId);
      const profile = AGENT_PROFILES.find((p) => p.id === activeAgent) || AGENT_PROFILES[0];
      if (messages.length === 1 && messages[0].role === "assistant") {
        setMessages([{ role: "assistant", content: greetingFor(profile, modeId) }]);
      }
    },
    [activeAgent, messages]
  );

  const handleAgentChange = useCallback(
    (agentId: string) => {
      setActiveAgent(agentId);
      const profile = AGENT_PROFILES.find((p) => p.id === agentId) || AGENT_PROFILES[0];
      if (messages.length === 1 && messages[0].role === "assistant") {
        setMessages([{ role: "assistant", content: greetingFor(profile, activeMode) }]);
      }
    },
    [activeMode, messages]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white border-r border-slate-200 ${className}`}>
      {/* Mode tabs */}
      <div className="flex border-b border-slate-200">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => handleModeChange(mode.id)}
            className={`flex-1 py-3 text-xs font-semibold text-center transition-colors ${
              activeMode === mode.id
                ? "text-slate-900 border-b-2 border-slate-900 bg-slate-50"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col gap-4 p-4 overflow-y-auto">
        {/* Mode Direct */}
        {activeMode === "direct" && (
          <div className="flex flex-col gap-3 h-full">
            <div className="text-xs text-slate-500">
              Décrivez votre présentation en langage naturel. L&apos;IA générera les slides automatiquement.
            </div>
            <Textarea
              value={directStory}
              onChange={(e) => setDirectStory(e.target.value)}
              placeholder="Ex: Une présentation de 5 slides sur notre stratégie cloud pour 2025..."
              className="flex-1 resize-none text-sm"
              disabled={isGenerating}
            />
            {streamedText && (
              <div className="text-[10px] text-slate-400 bg-slate-50 p-2 rounded border border-slate-200 max-h-24 overflow-y-auto">
                <pre className="whitespace-pre-wrap">{streamedText}</pre>
              </div>
            )}
            {genError && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                {genError}
              </div>
            )}
            {existingDeck && confirmReplace ? (
              <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5">
                <div className="text-xs text-amber-800">
                  Cette génération remplacera les {store.presentation?.slides?.length} slides
                  actuelles. Pour en ajouter une seule, utilisez l&apos;onglet Édition.
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setConfirmReplace(false);
                      void handleGenerateDirect();
                    }}
                  >
                    Remplacer la présentation
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setConfirmReplace(false)}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => {
                  if (existingDeck) {
                    setConfirmReplace(true);
                    return;
                  }
                  void handleGenerateDirect();
                }}
                disabled={isGenerating || !directStory.trim()}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Génération...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {existingDeck ? "Régénérer la présentation" : "Générer les slides"}
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Modes Interview & Brainstorm */}
        {(activeMode === "interview" || activeMode === "brainstorm") && (
          <>
            {/* Agent profiles */}
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Profil d&apos;agent
              </div>
              <div className="flex flex-wrap gap-2">
                {AGENT_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => handleAgentChange(profile.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeAgent === profile.id
                        ? "bg-blue-50 border border-blue-500 text-blue-700"
                        : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                    title={profile.description}
                  >
                    {profile.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Slide focus toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSlideFocus(!slideFocus)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                  slideFocus
                    ? "bg-blue-50 text-blue-700 border border-blue-300"
                    : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${slideFocus ? "bg-blue-500" : "bg-slate-300"}`} />
                {slideFocus ? "Focus slide ON" : "Focus slide OFF"}
              </button>
              {slideFocus && (
                <span className="text-[10px] text-slate-400">
                  Slide {store.currentSlideIndex + 1}: {store.presentation?.slides?.[store.currentSlideIndex]?.title || "Sans titre"}
                </span>
              )}
            </div>

            {/* Chat area */}
            <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 p-3 flex flex-col gap-3 min-h-[200px] overflow-y-auto">
              <ChatThread messages={messages} isGenerating={isGenerating} />
            </div>

            {/* Storytelling en cours */}
            {store.storytelling.trim() && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                  Storytelling en cours
                </div>
                <pre className="text-[11px] whitespace-pre-wrap font-sans leading-relaxed max-h-[120px] overflow-y-auto text-slate-700">
                  {store.storytelling}
                </pre>
                {existingDeck && confirmStoryReplace ? (
                  <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-2">
                    <div className="text-[10px] text-amber-800">
                      Cela remplacera les {store.presentation?.slides?.length} slides actuelles.
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setConfirmStoryReplace(false);
                          void handleGenerateSlidesFromStory();
                        }}
                      >
                        Remplacer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setConfirmStoryReplace(false)}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (existingDeck) {
                        setConfirmStoryReplace(true);
                        return;
                      }
                      void handleGenerateSlidesFromStory();
                    }}
                    disabled={isGenerating}
                    className="w-full gap-1.5"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {existingDeck ? "Remplacer les slides par le storytelling" : "Générer les slides"}
                  </Button>
                )}
              </div>
            )}

            {genError && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                {genError}
              </div>
            )}

            {/* Input */}
            <div className="text-[10px] text-slate-400 text-center">
              Slide {store.currentSlideIndex + 1} / {store.presentation?.slides?.length || 0} — {store.presentation?.slides?.[store.currentSlideIndex]?.title || "Sans titre"}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  slideFocus
                    ? `Modifie la slide ${store.currentSlideIndex + 1}...`
                    : "Votre réponse..."
                }
                className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                disabled={isGenerating}
              />
              <button
                onClick={handleSend}
                disabled={isGenerating || !input.trim()}
                className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Envoyer
              </button>
            </div>
          </>
        )}

        {/* Mode Édition — modification incrémentale du deck existant */}
        {activeMode === "edit" && (
          <div className="flex flex-col gap-3 h-full">
            {!existingDeck ? (
              <div className="text-xs text-slate-500">
                Générez d&apos;abord une présentation dans l&apos;onglet Direct, puis demandez ici
                vos modifications — par exemple « rajoute une slide sur les risques ».
              </div>
            ) : (
              <>
                <div className="text-[10px] text-slate-500 leading-relaxed line-clamp-3">
                  {store.presentation?.slides?.length} slides —{" "}
                  {store.presentation?.slides
                    ?.map((slide, index) => `${index + 1}. ${slide.title || "Sans titre"}`)
                    .join(" · ")}
                </div>

                <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 p-3 flex flex-col gap-3 min-h-[200px] overflow-y-auto">
                  {editMessages.length === 0 && (
                    <div className="text-[11px] text-slate-400 leading-relaxed">
                      Ex : « rajoute une slide sur les risques », « raccourcis la slide 2 »,
                      « supprime la dernière slide ».
                    </div>
                  )}
                  <ChatThread messages={editMessages} isGenerating={isGenerating} />
                </div>

                {genError && (
                  <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    {genError}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleDeckEdit();
                      }
                    }}
                    placeholder="Ex : rajoute une slide sur les risques..."
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-slate-500"
                    disabled={isGenerating}
                  />
                  <button
                    onClick={() => void handleDeckEdit()}
                    disabled={isGenerating || !editInput.trim()}
                    className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Envoyer
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
