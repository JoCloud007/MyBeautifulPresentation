"use client";

import { useState, useCallback, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, MessageCircle, Wand2, RotateCcw, CheckCircle2, ArrowRight } from "lucide-react";
import { usePresentationStore } from "../stores/presentationStore";
import { useLlmStore } from "../stores/llmStore";
import {
  callLlmChat,
  buildInterviewQuestionsPrompt,
  buildInterviewStorytellingPrompt,
  buildStorytellingPrompt,
  parseLlmSlidesResponse,
  normalizeLayout,
} from "@/lib/llm";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import { SlideLayout } from "../types/presentation";
import { motion, AnimatePresence } from "framer-motion";

export function StoryInterview() {
  const {
    interview,
    setInterviewSubject,
    setInterviewQuestions,
    setInterviewAnswer,
    setInterviewStorytelling,
    setInterviewStep,
    resetInterview,
    setStorytelling,
    setGenerating,
    createFromStory,
  } = usePresentationStore();

  const { config, isAvailable } = useLlmStore();
  const templateState = useTemplateStore();
  const template = getActiveTemplate(templateState);

  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleStartInterview = useCallback(async () => {
    if (!interview.subject.trim()) return;
    if (!isAvailable) {
      setError("Le LLM n'est pas disponible. Vérifiez la configuration.");
      return;
    }

    setError(null);
    setInterviewStep("asking");
    setGenerating(true);
    abortRef.current = new AbortController();

    try {
      const messages = buildInterviewQuestionsPrompt(interview.subject, config, template);
      const raw = await callLlmChat(config, messages, abortRef.current.signal);

      // Parse questions from response
      let questions: string[] = [];
      try {
        const parsed = JSON.parse(raw.trim());
        if (Array.isArray(parsed.questions)) {
          questions = parsed.questions.map(String);
        }
      } catch {
        // Fallback: split by newlines or numbers
        questions = raw
          .split(/\n/)
          .map((l) => l.replace(/^\d+\.\s*/, "").trim())
          .filter((l) => l.length > 10 && l.endsWith("?"));
      }

      if (questions.length === 0) {
        questions = [
          "Quel est l'objectif principal de cette présentation ?",
          "Qui est le public cible ?",
          "Quels sont les points clés à aborder ?",
        ];
      }

      setInterviewQuestions(questions);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Erreur lors de la génération des questions. Réessayez.");
      }
      setInterviewStep("idle");
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }, [interview.subject, isAvailable, config, template, setInterviewStep, setGenerating, setInterviewQuestions]);

  const handleGenerateStorytelling = useCallback(async () => {
    if (!isAvailable) {
      setError("Le LLM n'est pas disponible. Vérifiez la configuration.");
      return;
    }

    setError(null);
    setInterviewStep("generating");
    setGenerating(true);
    abortRef.current = new AbortController();

    try {
      const messages = buildInterviewStorytellingPrompt(
        interview.subject,
        interview.questions,
        interview.answers,
        config,
        template
      );
      const raw = await callLlmChat(config, messages, abortRef.current.signal);

      setInterviewStorytelling(raw.trim());
      setStorytelling(raw.trim());
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Erreur lors de la génération du storytelling. Réessayez.");
      }
      setInterviewStep("answering");
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }, [
    isAvailable,
    interview.subject,
    interview.questions,
    interview.answers,
    config,
    template,
    setInterviewStep,
    setGenerating,
    setInterviewStorytelling,
    setStorytelling,
  ]);

  const handleUseStorytelling = useCallback(async () => {
    if (!interview.storytelling || !isAvailable) return;

    setError(null);
    setGenerating(true);
    setStorytelling(interview.storytelling);
    abortRef.current = new AbortController();

    try {
      const messages = buildStorytellingPrompt(interview.storytelling, config, template);
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
        setError("La réponse du LLM n'a pas pu être analysée en slides. Vous pouvez copier le storytelling manuellement.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(`Erreur lors de la génération des slides : ${(err as Error).message}`);
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }, [
    interview.storytelling,
    isAvailable,
    config,
    template,
    setStorytelling,
    setGenerating,
    createFromStory,
  ]);

  const allAnswered = interview.answers.every((a) => a.trim().length > 0);

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Mode Interview
          </h3>
          <p className="text-xs text-muted-foreground">
            Décrivez votre sujet, répondez aux questions, et laissez l'IA construire votre storytelling.
          </p>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 1: Subject */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">1. Quel est le sujet de votre présentation ?</Label>
          <Textarea
            value={interview.subject}
            onChange={(e) => setInterviewSubject(e.target.value)}
            placeholder="Ex: Présentation de notre nouveau produit SaaS de gestion de projet..."
            className="text-sm min-h-[60px] resize-none"
            disabled={interview.step === "asking" || interview.step === "generating"}
          />
          <Button
            size="sm"
            onClick={handleStartInterview}
            disabled={!interview.subject.trim() || interview.step === "asking" || interview.step === "generating"}
            className="gap-1.5"
          >
            {interview.step === "asking" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MessageCircle className="h-3.5 w-3.5" />
            )}
            {interview.step === "asking" ? "Génération des questions..." : "Démarrer l'interview"}
          </Button>
        </div>

        {/* Step 2: Questions & Answers */}
        <AnimatePresence>
          {(interview.step === "answering" || interview.step === "generating" || interview.step === "done") && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <Label className="text-xs font-medium">2. Répondez aux questions</Label>
                <p className="text-xs text-muted-foreground">
                  Plus vos réponses sont détaillées, meilleur sera le storytelling.
                </p>
              </div>

              <div className="space-y-3">
                {interview.questions.map((question, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {index + 1}
                      </span>
                      <p className="text-xs font-medium leading-relaxed">{question}</p>
                    </div>
                    <Textarea
                      value={interview.answers[index] || ""}
                      onChange={(e) => setInterviewAnswer(index, e.target.value)}
                      placeholder="Votre réponse..."
                      className="text-xs min-h-[50px] resize-none"
                      disabled={interview.step === "generating"}
                    />
                  </motion.div>
                ))}
              </div>

              <Button
                size="sm"
                onClick={handleGenerateStorytelling}
                disabled={!allAnswered || interview.step === "generating"}
                className="gap-1.5 w-full"
              >
                {interview.step === "generating" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                {interview.step === "generating" ? "Génération du storytelling..." : "Générer le storytelling"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 3: Result */}
        <AnimatePresence>
          {interview.step === "done" && interview.storytelling && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <Label className="text-xs font-medium">3. Storytelling généré</Label>
              </div>

              <div className="rounded-lg border p-3 bg-muted/30">
                <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">
                  {interview.storytelling}
                </pre>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleUseStorytelling} className="gap-1.5 flex-1">
                  <ArrowRight className="h-3.5 w-3.5" />
                  Utiliser pour générer les slides
                </Button>
                <Button size="sm" variant="outline" onClick={resetInterview} className="gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Recommencer
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
