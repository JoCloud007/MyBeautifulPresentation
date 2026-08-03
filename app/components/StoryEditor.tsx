"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  FileUp,
  Sparkles,
  Loader2,
  Wand2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Radio,
  Eye,
  EyeOff,
} from "lucide-react";
import { usePresentationStore } from "../stores/presentationStore";
import { useLlmStore } from "../stores/llmStore";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import { importPPTX } from "@/lib/pptxImport";
import {
  buildStorytellingPrompt,
  parseLlmSlidesResponse,
  streamOllamaChat,
  callOllamaChat,
  checkLlmAvailability,
  normalizeLayout,
} from "@/lib/llm";
import { StoryExamplePrompts } from "./StoryExamplePrompts";
import { SlideLayout } from "../types/presentation";
import { motion, AnimatePresence } from "framer-motion";

export function StoryEditor() {
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

  const [importError, setImportError] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [streamMode, setStreamMode] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [checkingConnection, setCheckingConnection] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Check LLM connection on mount
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setCheckingConnection(true);
      try {
        const available = await checkLlmAvailability(config);
        if (!cancelled) {
          setAvailable(available);
        }
      } catch {
        if (!cancelled) {
          setAvailable(false);
        }
      } finally {
        if (!cancelled) {
          setCheckingConnection(false);
        }
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [config, setAvailable]);

  const handleGenerate = useCallback(async () => {
    if (!storytelling.trim() || isGenerating) return;
    setGenerating(true);
    setGenError(null);
    setRawResponse(null);
    setStreamedText("");

    try {
      const messages = buildStorytellingPrompt(storytelling, config, template);

      if (streamMode) {
        // Streaming mode
        abortRef.current = new AbortController();
        const generator = streamOllamaChat(config, messages, abortRef.current.signal);
        let accumulated = "";

        try {
          for await (const chunk of generator) {
            accumulated += chunk;
            setStreamedText(accumulated);
          }
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            // User cancelled — stop silently
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
        } else {
          setGenError(
            "La réponse du LLM n'a pas pu être analysée. Vous pouvez consulter la réponse brute ci-dessous."
          );
        }
      } else {
        // Non-streaming mode
        const raw = await callOllamaChat(config, messages);
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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isGenerating) return;
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      setImportError("Veuillez sélectionner un fichier .pptx");
      return;
    }
    setImportError(null);

    try {
      const pres = await importPPTX(file);
      usePresentationStore.getState().setPresentation(pres);
      setStorytelling(""); // Clear storytelling so old text doesn't overwrite imported deck
    } catch (err) {
      setImportError(String(err));
    }
  };

  const charCount = storytelling.length;
  const estimatedSlides = Math.min(8, Math.max(1, Math.ceil(charCount / 200)));

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5" />
              Storytelling
            </h2>
            <div className="flex items-center gap-2">
              {/* Connection status */}
              <div className="flex items-center gap-1.5 text-[11px]">
                {checkingConnection ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : isAvailable === true ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : isAvailable === false ? (
                  <AlertCircle className="h-3 w-3 text-red-500" />
                ) : null}
                <span className="text-muted-foreground hidden sm:inline">
                  {checkingConnection
                    ? "Connexion..."
                    : isAvailable === true
                    ? "LLM connecté"
                    : isAvailable === false
                    ? "LLM hors ligne"
                    : ""}
                </span>
              </div>

              <Label
                htmlFor="pptx-import"
                className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
              >
                <FileUp className="w-3.5 h-3.5" />
                Importer PPTX
              </Label>
              <input
                id="pptx-import"
                type="file"
                accept=".pptx"
                className="hidden"
                onChange={handleImport}
                disabled={isGenerating}
              />
            </div>
          </div>

          {/* Example prompts */}
          <StoryExamplePrompts onSelect={setStorytelling} />

          {/* Import error */}
          <AnimatePresence>
            {importError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs text-red-500 bg-red-50 p-2 rounded border border-red-100 overflow-hidden"
              >
                {importError}
              </motion.div>
            )}
          </AnimatePresence>

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
                <div className="bg-muted rounded border p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">
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
                  <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-[200px] overflow-auto">
                    {rawResponse}
                  </pre>
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
                className="bg-muted rounded border p-2"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Génération en cours...
                  </span>
                </div>
                <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-[150px] overflow-auto">
                  {streamedText}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Textarea */}
          <Textarea
            placeholder={`Décrivez votre présentation en langage naturel...\n\nExemple : Je veux une presentation sur les bienfaits de l'IA generative en entreprise. Le public est composé de dirigeants. Je veux montrer les cas d'usage, les bénéfices mesurables, et les étapes de mise en œuvre.`}
            value={storytelling}
            onChange={(e) => setStorytelling(e.target.value)}
            disabled={isGenerating}
            className="flex-1 resize-none text-sm leading-relaxed min-h-[180px]"
          />

          {/* Character count & estimation */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {charCount} caractères · ~{estimatedSlides} slide
              {estimatedSlides > 1 ? "s" : ""} estimée
              {estimatedSlides > 1 ? "s" : ""}
            </span>
            {storytelling.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-destructive"
                onClick={() => setStorytelling("")}
                disabled={isGenerating}
              >
                <Trash2 className="h-3 w-3" />
                Effacer
              </Button>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Bottom bar */}
      <div className="border-t bg-background p-3 flex flex-col gap-2">
        {/* Stream mode toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="stream-mode"
              checked={streamMode}
              onCheckedChange={setStreamMode}
              disabled={isGenerating}
              className="scale-75 origin-left"
            />
            <Label
              htmlFor="stream-mode"
              className="text-[11px] text-muted-foreground flex items-center gap-1 cursor-pointer"
            >
              <Radio className="h-3 w-3" />
              Mode streaming
            </Label>
          </div>
          <span className="text-xs text-muted-foreground">
            {presentation?.slides.length || 0} slide
            {(presentation?.slides.length || 0) > 1 ? "s" : ""}
          </span>
        </div>

        {/* Generate button */}
        <div className="flex gap-2">
          {isGenerating ? (
            <Button
              variant="destructive"
              className="flex-1 gap-2"
              onClick={handleCancel}
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Annuler la génération
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={!storytelling.trim() || isAvailable === false}
              className="flex-1 gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Générer les slides
            </Button>
          )}
        </div>

        {isAvailable === false && !checkingConnection && (
          <p className="text-[10px] text-red-500 text-center">
            Le LLM semble inaccessible. Vérifiez la configuration.
          </p>
        )}
      </div>
    </div>
  );
}
