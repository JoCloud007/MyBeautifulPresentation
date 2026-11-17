"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2,
  Radio,
  CheckCircle2,
} from "lucide-react";
import { usePresentationStore } from "../stores/presentationStore";
import { useLlmStore } from "../stores/llmStore";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import {
  buildStorytellingPrompt,
  parseLlmSlidesResponse,
  streamLlmChat,
  checkLlmAvailability,
  normalizeLayout,
} from "@/lib/llm";
import { SlideLayout } from "../types/presentation";
import { motion, AnimatePresence } from "framer-motion";

const DEBOUNCE_MS = 2000;

export function LiveStoryMode() {
  const {
    storytelling,
    setStorytelling,
    isGenerating,
    setGenerating,
    createFromStory,
    presentation,
  } = usePresentationStore();

  const { config, isAvailable, setAvailable } = useLlmStore();
  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);

  const [liveEnabled, setLiveEnabled] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [ghostSlides, setGhostSlides] = useState<
    Array<{ title: string; content: string; layout: SlideLayout }>
  >([]);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasGeneratedRef = useRef(false);

  // Check LLM connection on mount
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setCheckingConnection(true);
      try {
        const available = await checkLlmAvailability(config);
        if (!cancelled) setAvailable(available);
      } catch {
        if (!cancelled) setAvailable(false);
      } finally {
        if (!cancelled) setCheckingConnection(false);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [config, setAvailable]);

  const runGeneration = useCallback(
    async (text: string) => {
      if (!text.trim() || !isAvailable) return;
      setGenerating(true);
      setGenError(null);
      setRawResponse(null);
      setStreamedText("");
      setGhostSlides([]);
      hasGeneratedRef.current = false;

      try {
        const messages = buildStorytellingPrompt(text, config, template);
        abortRef.current = new AbortController();
        const generator = streamLlmChat(
          config,
          messages,
          abortRef.current.signal
        );
        let accumulated = "";
        let lastParsedCount = 0;

        for await (const chunk of generator) {
          accumulated += chunk;
          setStreamedText(accumulated);

          // Try to progressively parse slides as they stream in
          const parsed = parseLlmSlidesResponse(accumulated);
          if (parsed && parsed.slides.length > lastParsedCount) {
            const newSlides = parsed.slides.map((s) => ({
              id: crypto.randomUUID(),
              title: s.title || "",
              content: s.content || "",
              layout: normalizeLayout(s.layout) as SlideLayout,
            }));
            setGhostSlides(newSlides);
            lastParsedCount = parsed.slides.length;

            // Once we have a complete parse, commit it
            if (
              accumulated.trim().endsWith("}") ||
              accumulated.trim().endsWith("]")
            ) {
              const finalParsed = parseLlmSlidesResponse(accumulated);
              if (finalParsed && finalParsed.slides.length > 0) {
                createFromStory(
                  finalParsed.title || "Présentation",
                  finalParsed.slides.map((s) => ({
                    id: crypto.randomUUID(),
                    title: s.title || "",
                    content: s.content || "",
                    layout: normalizeLayout(s.layout) as SlideLayout,
                  }))
                );
                hasGeneratedRef.current = true;
              }
            }
          }
        }

        setRawResponse(accumulated);
        const finalParsed = parseLlmSlidesResponse(accumulated);

        if (finalParsed && finalParsed.slides.length > 0) {
          if (!hasGeneratedRef.current) {
            createFromStory(
              finalParsed.title || "Présentation",
              finalParsed.slides.map((s) => ({
                id: crypto.randomUUID(),
                title: s.title || "",
                content: s.content || "",
                layout: normalizeLayout(s.layout) as SlideLayout,
              }))
            );
          }
          setGhostSlides([]);
          setGenError(null);
        } else {
          setGenError(
            "La réponse du LLM n'a pas pu être analysée. Vous pouvez consulter la réponse brute ci-dessous."
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setGenerating(false);
          abortRef.current = null;
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setGenError(`Erreur lors de la generation : ${message}`);
      } finally {
        setGenerating(false);
        abortRef.current = null;
      }
    },
    [config, template, isAvailable, setGenerating, createFromStory]
  );

  // Debounced live generation
  useEffect(() => {
    if (!liveEnabled) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (storytelling.trim().length < 20) {
      setGhostSlides([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      runGeneration(storytelling);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [storytelling, liveEnabled, runGeneration]);

  const handleCancel = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setGenerating(false);
    setGhostSlides([]);
  }, [setGenerating]);

  const charCount = storytelling.length;
  const estimatedSlides = Math.min(8, Math.max(1, Math.ceil(charCount / 200)));

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5" />
              Live Storytelling
            </h2>
            <div className="flex items-center gap-2">
              {/* Connection status */}
              <div className="flex items-center gap-1.5 text-[11px]">
                {checkingConnection ? (
                  <Loader2 className="h-3 w-3 animate-spin text-white/40" />
                ) : isAvailable === true ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : isAvailable === false ? (
                  <AlertCircle className="h-3 w-3 text-red-500" />
                ) : null}
                <span className="text-white/40 hidden sm:inline">
                  {checkingConnection
                    ? "Connexion..."
                    : isAvailable === true
                    ? "LLM connecté"
                    : isAvailable === false
                    ? "LLM hors ligne"
                    : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Live toggle */}
          <div className="flex items-center justify-between rounded-lg border bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <Switch
                id="live-mode"
                checked={liveEnabled}
                onCheckedChange={setLiveEnabled}
                disabled={isGenerating || isAvailable === false}
                className="scale-75 origin-left"
              />
              <Label
                htmlFor="live-mode"
                className="text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <Radio className="h-3 w-3" />
                Mode live (génération automatique)
              </Label>
            </div>
            <span className="text-[10px] text-white/40">
              Déclenché après {DEBOUNCE_MS / 1000}s d'inactivité
            </span>
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
                <div className="text-xs text-red-600 bg-red-50 p-3 rounded border border-red-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">{genError}</p>
                      {rawResponse && (
                        <button
                          onClick={() => setShowRaw(!showRaw)}
                          className="mt-1.5 flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 underline"
                        >
                          {showRaw ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                          {showRaw
                            ? "Masquer la réponse brute"
                            : "Voir la réponse brute"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Raw response viewer */}
          <AnimatePresence>
            {showRaw && rawResponse && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-white/10 rounded border p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-white/40 uppercase">
                      Réponse LLM brute
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[10px] px-1.5"
                      onClick={() => {
                        navigator.clipboard.writeText(rawResponse);
                      }}
                    >
                      Copier
                    </Button>
                  </div>
                  <pre className="text-[10px] font-mono text-white/40 whitespace-pre-wrap break-all max-h-[200px] overflow-auto">
                    {rawResponse}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Ghost preview */}
          <AnimatePresence>
            {isGenerating && ghostSlides.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                <div className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span className="text-[10px] font-medium text-white/40">
                    Aperçu en cours...
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {ghostSlides.map((slide, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 0.55, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="rounded-lg border border-dashed border-muted-foreground/30 bg-white/5 p-3 pointer-events-none select-none"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] uppercase tracking-wider text-white/40/60 font-medium">
                          {slide.layout}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-foreground/50 line-clamp-1">
                        {slide.title}
                      </p>
                      <p className="text-[10px] text-white/40/40 line-clamp-2 mt-0.5">
                        {slide.content}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Streamed text preview */}
          <AnimatePresence>
            {isGenerating && streamedText && ghostSlides.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white/10 rounded border p-2"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
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
            placeholder={`Décrivez votre présentation en langage naturel...\n\nLe mode live génère automatiquement les slides après ${DEBOUNCE_MS / 1000} secondes d'inactivité.`}
            value={storytelling}
            onChange={(e) => setStorytelling(e.target.value)}
            disabled={isGenerating && !liveEnabled}
            className="flex-1 resize-none text-sm leading-relaxed min-h-[220px]"
          />

          {/* Character count & estimation */}
          <div className="flex items-center justify-between text-[11px] text-white/40">
            <span>
              {charCount} caractères · ~{estimatedSlides} slide
              {estimatedSlides > 1 ? "s" : ""} estimée
              {estimatedSlides > 1 ? "s" : ""}
            </span>
            {storytelling.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] gap-1 text-white/40 hover:text-destructive"
                onClick={() => setStorytelling("")}
                disabled={isGenerating}
              >
                <Trash2 className="h-3 w-3" />
                Effacer
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t bg-transparent p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">
            {presentation?.slides.length || 0} slide
            {(presentation?.slides.length || 0) > 1 ? "s" : ""}
          </span>
          {isGenerating && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              className="gap-1.5"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Annuler
            </Button>
          )}
        </div>

        {!liveEnabled && (
          <Button
            onClick={() => runGeneration(storytelling)}
            disabled={!storytelling.trim() || isGenerating || isAvailable === false}
            className="w-full gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Générer les slides
          </Button>
        )}

        {isAvailable === false && !checkingConnection && (
          <p className="text-[10px] text-red-500 text-center">
            Le LLM semble inaccessible. Vérifiez la configuration.
          </p>
        )}
      </div>
    </div>
  );
}
