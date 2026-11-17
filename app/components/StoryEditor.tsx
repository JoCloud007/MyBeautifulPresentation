"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Loader2,
} from "lucide-react";
import { usePresentationStore } from "../stores/presentationStore";
import { useLlmStore } from "../stores/llmStore";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import {
  buildStorytellingPrompt,
  parseLlmSlidesResponse,
  streamLlmChat,
  callLlmChat,
  normalizeLayout,
} from "@/lib/llm";
import { SlideLayout } from "../types/presentation";
import { motion, AnimatePresence } from "framer-motion";

export function StoryEditor() {
  const {
    storytelling,
    setStorytelling,
    isGenerating,
    setGenerating,
    createFromStory,
  } = usePresentationStore();

  const { config } = useLlmStore();
  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);

  const [genError, setGenError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [streamMode] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!storytelling.trim() || isGenerating) return;
    setGenerating(true);
    setGenError(null);
    setRawResponse(null);
    setStreamedText("");

    try {
      const messages = buildStorytellingPrompt(storytelling, config, template);

      if (streamMode) {
        abortRef.current = new AbortController();
        const generator = streamLlmChat(config, messages, abortRef.current.signal);
        let accumulated = "";
        let hasCommitted = false;

        try {
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
                createFromStory(parsed.title || "Présentation", slides);
                hasCommitted = true;
                setGenError(null);
              } else {
                const currentStore = usePresentationStore.getState();
                if (currentStore.presentation && parsed.slides.length !== currentStore.presentation.slides.length) {
                  createFromStory(parsed.title || "Présentation", slides);
                }
              }
            }
          }
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            setGenerating(false);
            abortRef.current = null;
            return;
          }
          throw err;
        }

        setRawResponse(accumulated);
        const parsed = parseLlmSlidesResponse(accumulated);

        if (parsed && parsed.slides.length > 0) {
          const slides = parsed.slides.map((s) => ({
            id: crypto.randomUUID(),
            title: s.title || "",
            content: s.content || "",
            layout: normalizeLayout(s.layout) as SlideLayout,
          }));
          createFromStory(parsed.title || "Présentation", slides);
          setGenError(null);
        } else if (!hasCommitted) {
          setGenError(
            "La réponse du LLM n'a pas pu être analysée. Vous pouvez consulter la réponse brute ci-dessous."
          );
        }
      } else {
        const raw = await callLlmChat(config, messages);
        setRawResponse(raw);
        const parsed = parseLlmSlidesResponse(raw);

        if (parsed && parsed.slides.length > 0) {
          const slides = parsed.slides.map((s) => ({
            id: crypto.randomUUID(),
            title: s.title || "",
            content: s.content || "",
            layout: normalizeLayout(s.layout) as SlideLayout,
          }));
          createFromStory(parsed.title || "Présentation", slides);
          setGenError(null);
        } else {
          setGenError(
            "La réponse du LLM n'a pas pu être analysée. Vous pouvez consulter la réponse brute ci-dessous."
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setGenError(`Erreur lors de la generation : ${message}`);
      console.error("Generation error:", err);
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }, [storytelling, isGenerating, streamMode, config, template, setGenerating, createFromStory]);

  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setGenerating(false);
  }, [setGenerating]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-6 max-w-2xl mx-auto">
          {/* Header */}
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">
              Raconte ton histoire
            </h2>
            <p className="text-sm text-white/40">
              Décris ta présentation en langage naturel et l'IA générera les slides.
            </p>
          </div>

          {/* Generation error */}
          <AnimatePresence>
            {genError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="text-xs text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                  {genError}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Streamed text preview */}
          <AnimatePresence>
            {streamMode && isGenerating && streamedText && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white/5 rounded-lg border border-white/10 p-3"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Loader2 className="h-3 w-3 animate-spin text-[#6366f1]" />
                  <span className="text-[10px] font-medium text-white/40">
                    Génération en cours...
                  </span>
                </div>
                <pre className="text-[10px] font-mono text-white/40 whitespace-pre-wrap break-all max-h-[150px] overflow-auto">
                  {streamedText}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Textarea */}
          <Textarea
            placeholder="Ex: Une présentation de 5 slides sur les avantages du télétravail pour les entreprises tech..."
            value={storytelling}
            onChange={(e) => setStorytelling(e.target.value)}
            disabled={isGenerating}
            className="resize-none text-sm leading-relaxed min-h-[160px] bg-[#16162a] border-white/10 text-[#e2e8f0] placeholder:text-white/30 focus:border-[#6366f1]/50 focus:ring-[#6366f1]/20 rounded-xl"
          />

          {/* Generate button */}
          {isGenerating ? (
            <Button
              variant="outline"
              className="w-full gap-2 border-white/10 bg-white/5 hover:bg-white/10 text-[#e2e8f0] rounded-full"
              onClick={handleCancel}
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Annuler la génération
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={!storytelling.trim()}
              className="w-full gap-2 bg-gradient-to-r from-[#6366f1] to-[#a855f7] hover:from-[#5558e0] hover:to-[#9946e6] text-white rounded-full font-medium"
            >
              <Sparkles className="w-4 h-4" />
              Générer les slides
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
