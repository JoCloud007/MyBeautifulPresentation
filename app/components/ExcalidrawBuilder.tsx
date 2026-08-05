"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import dynamic from "next/dynamic";
import { Save, RotateCcw, Loader2, Wand2, MessageCircle, Send, Bot, User } from "lucide-react";
import { usePresentationStore } from "../stores/presentationStore";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import { useLlmStore } from "../stores/llmStore";
import { callLlmChat } from "@/lib/llm";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false }
);

const DEFAULT_SCENE = {
  elements: [],
  appState: {
    theme: "light" as const,
    viewBackgroundColor: "#ffffff",
  },
};

export function ExcalidrawBuilder() {
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
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [title, setTitle] = useState("Schéma");
  const isInitializedRef = useRef(false);

  const { config, isAvailable } = useLlmStore();

  interface ChatMessage {
    role: "user" | "assistant";
    content: string;
  }
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Load from current slide
  useEffect(() => {
    if (currentSlide?.layout === "excalidraw") {
      setTitle(currentSlide.title || "Schéma");
      if (excalidrawAPI && currentSlide.content) {
        try {
          const parsed = JSON.parse(currentSlide.content);
          excalidrawAPI.updateScene({
            elements: parsed.elements || [],
            appState: { ...parsed.appState, theme: "light" as const },
          });
          isInitializedRef.current = true;
        } catch {
          excalidrawAPI.updateScene({
            elements: [],
            appState: { theme: "light" as const, viewBackgroundColor: "#ffffff" },
          });
        }
      }
    } else {
      setTitle("Schéma");
      isInitializedRef.current = false;
    }
  }, [currentSlide?.id, excalidrawAPI]);

  // Initialize empty scene when no slide data
  useEffect(() => {
    if (excalidrawAPI && !isInitializedRef.current) {
      excalidrawAPI.updateScene({
        elements: [],
        appState: { theme: "light" as const, viewBackgroundColor: "#ffffff" },
      });
      isInitializedRef.current = true;
    }
  }, [excalidrawAPI]);

  const handleReset = useCallback(() => {
    if (excalidrawAPI) {
      excalidrawAPI.updateScene({
        elements: [],
        appState: { theme: "light" as const, viewBackgroundColor: "#ffffff" },
      });
    }
    setTitle("Schéma");
  }, [excalidrawAPI]);

  // Helper: generate unique id
  const generateId = () => Math.random().toString(36).substring(2, 15);

  // Convert simplified LLM elements to full Excalidraw elements
  const convertToExcalidrawElements = useCallback((simpleElements: any[]): any[] => {
    const now = Date.now();
    return simpleElements.map((el, i) => {
      const base = {
        id: generateId(),
        x: el.x ?? 0,
        y: el.y ?? 0,
        width: el.width ?? 100,
        height: el.height ?? 60,
        angle: 0,
        strokeColor: el.strokeColor ?? "#1e1e1e",
        backgroundColor: el.backgroundColor ?? "transparent",
        fillStyle: "hachure",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: el.type === "rectangle" || el.type === "diamond" ? { type: 3 } : null,
        seed: Math.floor(Math.random() * 1000000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 1000000000),
        isDeleted: false,
        boundElements: el.text ? [{ type: "text", id: generateId() }] : null,
        updated: now,
        link: null,
        locked: false,
      };

      if (el.type === "text") {
        return {
          ...base,
          type: "text",
          text: el.text ?? "",
          fontSize: el.fontSize ?? 20,
          fontFamily: 1,
          textAlign: "center",
          verticalAlign: "middle",
          baseline: 18,
          width: el.width ?? 100,
          height: el.height ?? 25,
          containerId: null,
          originalText: el.text ?? "",
          lineHeight: 1.25,
          roundness: null,
        };
      }

      if (el.type === "arrow") {
        const startX = el.startX ?? el.x ?? 0;
        const startY = el.startY ?? el.y ?? 0;
        const endX = el.endX ?? (el.x + 100);
        const endY = el.endY ?? el.y ?? 0;
        return {
          ...base,
          type: "arrow",
          x: Math.min(startX, endX),
          y: Math.min(startY, endY),
          width: Math.abs(endX - startX),
          height: Math.abs(endY - startY),
          points: [[0, 0], [endX - startX, endY - startY]],
          startBinding: null,
          endBinding: null,
          startArrowhead: el.startArrowhead ?? null,
          endArrowhead: el.endArrowhead ?? "arrow",
          roundness: { type: 2 },
        };
      }

      if (el.type === "line") {
        const startX = el.startX ?? el.x ?? 0;
        const startY = el.startY ?? el.y ?? 0;
        const endX = el.endX ?? (el.x + 100);
        const endY = el.endY ?? el.y ?? 0;
        return {
          ...base,
          type: "line",
          x: Math.min(startX, endX),
          y: Math.min(startY, endY),
          width: Math.abs(endX - startX),
          height: Math.abs(endY - startY),
          points: [[0, 0], [endX - startX, endY - startY]],
          roundness: null,
        };
      }

      // rectangle, ellipse, diamond
      return {
        ...base,
        type: el.type ?? "rectangle",
      };
    });
  }, []);

  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim() || !isAvailable) return;

    const userContent = chatInput.trim();
    setChatInput("");
    setChatError(null);

    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: userContent }];
    setChatMessages(newMessages);

    setIsChatting(true);
    chatAbortRef.current = new AbortController();

    try {
      const { buildExcalidrawChatPrompt } = await import("@/lib/llm");
      const currentElements = excalidrawAPI ? [...excalidrawAPI.getSceneElements()] : [];
      const messages = buildExcalidrawChatPrompt(currentElements, newMessages, config, template);
      const raw = await callLlmChat(config, messages, chatAbortRef.current.signal);

      let reply = "";
      let elements: any[] = [];

      // Try JSON format first
      try {
        const parsed = JSON.parse(raw);
        if (parsed.reply) reply = parsed.reply;
        if (parsed.elements && Array.isArray(parsed.elements)) {
          elements = convertToExcalidrawElements(parsed.elements);
        }
      } catch {
        reply = raw.trim();
      }

      setChatMessages([...newMessages, { role: "assistant", content: reply || "Diagramme mis à jour." }]);

      if (elements.length > 0 && excalidrawAPI) {
        excalidrawAPI.updateScene({
          elements,
          appState: { theme: "light" as const, viewBackgroundColor: "#ffffff" },
        });
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setChatError(`Erreur : ${(err as Error).message}`);
      }
    } finally {
      setIsChatting(false);
      chatAbortRef.current = null;
    }
  }, [chatInput, isAvailable, chatMessages, config, template, excalidrawAPI, convertToExcalidrawElements]);

  const handleInsert = useCallback(() => {
    if (!excalidrawAPI) return;

    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const data = JSON.stringify({
      elements,
      appState: {
        theme: appState.theme,
        viewBackgroundColor: appState.viewBackgroundColor,
      },
    });

    if (currentSlide?.layout === "excalidraw") {
      updateSlide(currentSlideIndex, {
        ...currentSlide,
        layout: "excalidraw",
        title: title || "Schéma",
        content: data,
      });
    } else {
      addSlide({
        layout: "excalidraw",
        title: title || "Schéma",
        content: data,
      });
    }
  }, [excalidrawAPI, title, currentSlide, currentSlideIndex, addSlide, updateSlide]);

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
            Excalidraw
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: editor */}
        <div className="flex flex-col h-full flex-1 overflow-hidden">
          {/* Title input */}
          <div className="px-4 py-2 border-b shrink-0 space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Titre du schéma
            </Label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm px-2 py-1 rounded border bg-background"
              placeholder="Titre du schéma..."
            />
          </div>

          {/* Chat conversation */}
          <div
            className="border-b shrink-0 flex flex-col"
            style={{ borderColor: colors.border, maxHeight: "260px" }}
          >
            <div className="px-4 py-2 flex items-center justify-between shrink-0">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
                <MessageCircle className="h-3 w-3" />
                Conversation
              </Label>
              {chatMessages.length > 0 && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setChatMessages([])}
                  className="h-5 text-[10px]"
                >
                  Effacer
                </Button>
              )}
            </div>

            {/* Messages */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 pb-2 space-y-2 min-h-0">
              {chatMessages.length === 0 && (
                <div className="text-[11px] text-muted-foreground text-center py-3">
                  Décrivez le diagramme que vous voulez créer...
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
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
                        {msg.role === "user" ? "Vous" : "Assistant"}
                      </span>
                    </div>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatting && (
                <div className="flex gap-2">
                  <div className="bg-muted border rounded-lg px-3 py-2 text-xs">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-4 py-2 shrink-0 border-t" style={{ borderColor: colors.border }}>
              <div className="flex gap-2">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleChatSend();
                    }
                  }}
                  placeholder="Votre message..."
                  className="text-xs min-h-[36px] resize-none flex-1"
                  disabled={isChatting}
                />
                <Button
                  size="sm"
                  onClick={handleChatSend}
                  disabled={!chatInput.trim() || isChatting || !isAvailable}
                  className="h-9 px-2.5"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
              {chatError && (
                <div className="text-[11px] text-destructive bg-destructive/10 rounded p-1.5 mt-1.5">
                  {chatError}
                </div>
              )}
            </div>
          </div>

          {/* Excalidraw canvas */}
          <div className="flex-1 overflow-hidden relative">
            <Excalidraw
              excalidrawAPI={(api) => setExcalidrawAPI(api)}
              initialData={DEFAULT_SCENE}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  saveToActiveFile: false,
                  saveAsImage: false,
                  export: false,
                  toggleTheme: false,
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-t flex-shrink-0"
        style={{ borderColor: colors.border }}
      >
        <Button size="sm" variant="ghost" onClick={handleReset}>
          <RotateCcw className="size-3.5 mr-1" />
          Réinitialiser
        </Button>

        <Button size="sm" onClick={handleInsert}>
          <Save className="size-3.5 mr-1" />
          {currentSlide?.layout === "excalidraw" ? "Modifier la slide" : "Insérer dans la présentation"}
        </Button>
      </div>
    </div>
  );
}
