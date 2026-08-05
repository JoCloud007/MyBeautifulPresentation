"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Lightbulb, Send, RotateCcw, ArrowRight, User, Bot } from "lucide-react";
import { usePresentationStore } from "../stores/presentationStore";
import { useLlmStore } from "../stores/llmStore";
import { callLlmChat, buildBrainstormingPrompt, parseLlmSlidesResponse, normalizeLayout } from "@/lib/llm";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import { SlideLayout } from "../types/presentation";
import { motion, AnimatePresence } from "framer-motion";

export const BRAINSTORM_PERSONAS = [
  {
    id: "auto",
    name: "Auto (détecté)",
    description: "L'IA choisit le meilleur profil selon votre sujet",
    prompt: "",
  },
  {
    id: "expert",
    name: "Expert technique",
    description: "Approfondit les détails techniques et la rigueur",
    prompt:
      "Tu es un expert technique senior reconnu dans ton domaine. Tu poses des questions précises, exiges la clarté, identifies les incohérences, et pousses à la profondeur. Tu ne laisses jamais passer une affirmation non justifiée. Ton objectif : rendre le storytelling irréprochable sur le fond.",
  },
  {
    id: "manager",
    name: "Manager",
    description: "Focus exécution, impact business et timeline",
    prompt:
      "Tu es un manager senior avec 15 ans d'expérience. Tu regardes tout sous l'angle de l'exécution : qui fait quoi, quand, avec quels moyens ? Tu challenges sur la faisabilité, le calendrier, les ressources nécessaires. Tu veux un storytelling qui convaincra les équipes et les décideurs.",
  },
  {
    id: "cfo",
    name: "CFO",
    description: "Focus financier, ROI et viabilité",
    prompt:
      "Tu es un Directeur Financier (CFO). Chaque décision a un coût, chaque action un retour. Tu demandes des chiffres, tu challenges les hypothèses financières, tu veux savoir comment on rentabilise l'investissement. Ton but : s'assurer que le storytelling est solide financièrement.",
  },
  {
    id: "creative",
    name: "Créatif",
    description: "Expert en storytelling et narration",
    prompt:
      "Tu es un expert en storytelling et narration. Tu penses en arcs dramatiques, en émotions, en images mentales. Tu challengeras la structure narrative, proposes des accroches percutantes, identifies les moments clés. Tu veux un storytelling qui captive et marque les esprits.",
  },
  {
    id: "skeptic",
    name: "Sceptique",
    description: "L'avocat du diable, challenge tout",
    prompt:
      "Tu joues le rôle de l'avocat du diable. Ta mission : trouver TOUT ce qui ne tient pas la route. Tu remets en cause chaque affirmation, chaque hypothèse, chaque plan. Si tu ne trouves rien à redire, c'est suspect. Tu veux un storytelling à toute épreuve face aux objections.",
  },
];

export function StoryBrainstorming() {
  const {
    brainstorm,
    setBrainstormPersona,
    setBrainstormSubject,
    addBrainstormMessage,
    setBrainstormStorytelling,
    resetBrainstorm,
    setStorytelling,
    setGenerating,
    createFromStory,
  } = usePresentationStore();

  const { config, isAvailable } = useLlmStore();
  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGeneratingLocal] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const persona = BRAINSTORM_PERSONAS.find((p) => p.id === brainstorm.persona) || BRAINSTORM_PERSONAS[0];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [brainstorm.messages.length]);

  const handleStart = useCallback(async () => {
    if (!brainstorm.subject.trim() || !isAvailable) return;

    setError(null);
    setIsGeneratingLocal(true);
    setGenerating(true);
    abortRef.current = new AbortController();

    try {
      const messages = buildBrainstormingPrompt(
        brainstorm.subject,
        [],
        persona,
        config,
        template
      );
      const raw = await callLlmChat(config, messages, abortRef.current.signal);

      let reply = raw.trim();
      let storytelling = "";

      try {
        const parsed = JSON.parse(raw);
        if (parsed.reply) reply = parsed.reply;
        if (parsed.storytelling) storytelling = parsed.storytelling;
      } catch {
        // Plain text response — try to extract storytelling section
        const storytellingMatch = raw.match(/(?:Storytelling|STORYTELLING|Récit)[:\s]*([\s\S]*?)(?=\n\n|$)/i);
        if (storytellingMatch) {
          storytelling = storytellingMatch[1].trim();
          reply = raw.replace(storytellingMatch[0], "").trim();
        }
      }

      addBrainstormMessage({ role: "assistant", content: reply });
      if (storytelling) {
        setBrainstormStorytelling(storytelling);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Erreur lors du démarrage du brainstorming. Réessayez.");
      }
    } finally {
      setIsGeneratingLocal(false);
      setGenerating(false);
      abortRef.current = null;
    }
  }, [
    brainstorm.subject,
    brainstorm.persona,
    isAvailable,
    config,
    template,
    persona,
    addBrainstormMessage,
    setBrainstormStorytelling,
    setGenerating,
  ]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !isAvailable || isGenerating) return;

    const userContent = input.trim();
    setInput("");
    setError(null);
    addBrainstormMessage({ role: "user", content: userContent });

    setIsGeneratingLocal(true);
    setGenerating(true);
    abortRef.current = new AbortController();

    try {
      const messages = buildBrainstormingPrompt(
        brainstorm.subject,
        [...brainstorm.messages, { role: "user", content: userContent }],
        persona,
        config,
        template
      );
      const raw = await callLlmChat(config, messages, abortRef.current.signal);

      let reply = raw.trim();
      let storytelling = "";

      try {
        const parsed = JSON.parse(raw);
        if (parsed.reply) reply = parsed.reply;
        if (parsed.storytelling) storytelling = parsed.storytelling;
      } catch {
        const storytellingMatch = raw.match(/(?:Storytelling|STORYTELLING|Récit)[:\s]*([\s\S]*?)(?=\n\n|$)/i);
        if (storytellingMatch) {
          storytelling = storytellingMatch[1].trim();
          reply = raw.replace(storytellingMatch[0], "").trim();
        }
      }

      addBrainstormMessage({ role: "assistant", content: reply });
      if (storytelling) {
        setBrainstormStorytelling(storytelling);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Erreur lors de la réponse. Réessayez.");
      }
    } finally {
      setIsGeneratingLocal(false);
      setGenerating(false);
      abortRef.current = null;
    }
  }, [
    input,
    isAvailable,
    isGenerating,
    brainstorm.subject,
    brainstorm.messages,
    brainstorm.persona,
    persona,
    config,
    template,
    addBrainstormMessage,
    setBrainstormStorytelling,
    setGenerating,
  ]);

  const handleGenerateSlides = useCallback(async () => {
    if (!brainstorm.storytelling || !isAvailable) return;

    setError(null);
    setIsGeneratingLocal(true);
    setGenerating(true);
    setStorytelling(brainstorm.storytelling);
    abortRef.current = new AbortController();

    try {
      const { buildStorytellingPrompt } = await import("@/lib/llm");
      const messages = buildStorytellingPrompt(brainstorm.storytelling, config, template);
      const raw = await callLlmChat(config, messages, abortRef.current.signal);
      const parsed = parseLlmSlidesResponse(raw);

      if (parsed && parsed.slides.length > 0) {
        const slides = parsed.slides.map((s) => ({
          id: crypto.randomUUID(),
          title: s.title || "",
          content: s.content || "",
          layout: normalizeLayout(s.layout) as SlideLayout,
        }));
        createFromStory(parsed.title || "Présentation", slides);
      } else {
        setError("La réponse du LLM n'a pas pu être analysée en slides.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(`Erreur lors de la génération des slides : ${(err as Error).message}`);
      }
    } finally {
      setIsGeneratingLocal(false);
      setGenerating(false);
      abortRef.current = null;
    }
  }, [
    brainstorm.storytelling,
    isAvailable,
    config,
    template,
    setStorytelling,
    setGenerating,
    createFromStory,
  ]);

  const hasStarted = brainstorm.messages.length > 0;

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Header */}
      <div className="border-b px-4 py-3 space-y-3 shrink-0">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Mode Brainstorming
          </h3>
          <p className="text-xs text-muted-foreground">
            Discutez avec un expert pour affiner votre storytelling en temps réel.
          </p>
        </div>

        {/* Persona selector */}
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Persona
          </Label>
          <Select
            value={brainstorm.persona}
            onValueChange={(v) => v && setBrainstormPersona(v)}
          >
            <SelectTrigger size="sm" className="w-full text-xs">
              <SelectValue placeholder="Choisir un persona" />
            </SelectTrigger>
            <SelectContent>
              {BRAINSTORM_PERSONAS.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  <div className="flex flex-col">
                    <span>{p.name}</span>
                    <span className="text-[10px] text-muted-foreground">{p.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Subject */}
        {!hasStarted && (
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Sujet de la présentation
            </Label>
            <Textarea
              value={brainstorm.subject}
              onChange={(e) => setBrainstormSubject(e.target.value)}
              placeholder="Décrivez le sujet de votre présentation..."
              className="text-xs min-h-[50px] resize-none"
            />
            <Button
              size="sm"
              onClick={handleStart}
              disabled={!brainstorm.subject.trim() || !isAvailable || isGenerating}
              className="w-full gap-1.5"
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Lightbulb className="h-3.5 w-3.5" />
              )}
              {isGenerating ? "Démarrage..." : "Démarrer le brainstorming"}
            </Button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* Chat */}
      {hasStarted && (
        <>
          <ScrollArea ref={scrollRef} className="flex-1 px-4 py-3">
            <div className="space-y-3">
              {brainstorm.messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted border"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 opacity-70">
                      {msg.role === "user" ? (
                        <User className="h-3 w-3" />
                      ) : (
                        <Bot className="h-3 w-3" />
                      )}
                      <span className="text-[10px] font-medium">
                        {msg.role === "user" ? "Vous" : persona.name}
                      </span>
                    </div>
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {isGenerating && (
                <div className="flex gap-2">
                  <div className="bg-muted border rounded-lg px-3 py-2 text-xs">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t px-4 py-2.5 shrink-0 space-y-2">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Votre réponse..."
                className="text-xs min-h-[36px] resize-none flex-1"
                disabled={isGenerating}
              />
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!input.trim() || isGenerating}
                className="h-9 px-2.5"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Storytelling panel */}
            {brainstorm.storytelling && (
              <div className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Storytelling en cours
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setBrainstormStorytelling("")}
                    className="h-5 text-[10px]"
                  >
                    Effacer
                  </Button>
                </div>
                <pre className="text-[11px] whitespace-pre-wrap font-sans leading-relaxed max-h-[100px] overflow-y-auto">
                  {brainstorm.storytelling}
                </pre>
                <Button
                  size="sm"
                  onClick={handleGenerateSlides}
                  disabled={isGenerating}
                  className="w-full gap-1.5"
                >
                  {isGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                  Générer les slides
                </Button>
              </div>
            )}

            <div className="flex justify-between">
              <Button size="xs" variant="ghost" onClick={resetBrainstorm} className="gap-1 text-[10px]">
                <RotateCcw className="h-3 w-3" />
                Recommencer
              </Button>
              <span className="text-[10px] text-muted-foreground">
                {brainstorm.messages.filter((m) => m.role === "assistant").length} échanges
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
