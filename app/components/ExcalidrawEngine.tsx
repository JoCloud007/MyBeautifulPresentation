"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

interface ExcalidrawEngineProps {
  data: string;
  className?: string;
}

// Dynamic import to avoid SSR issues
const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false }
);

export function ExcalidrawEngine({ data, className = "" }: ExcalidrawEngineProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(data);
      setParsedData(parsed);
    } catch {
      setParsedData({ elements: [], appState: {} });
    }
  }, [data]);

  useEffect(() => {
    if (excalidrawAPI && parsedData) {
      excalidrawAPI.updateScene({
        elements: parsedData.elements || [],
        appState: {
          ...parsedData.appState,
          viewModeEnabled: true,
          theme: "light" as const,
        },
      });
    }
  }, [excalidrawAPI, parsedData]);

  if (!parsedData) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-sm text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full ${className}`}>
      <Excalidraw
        initialData={{
          elements: parsedData.elements || [],
          appState: {
            theme: "light" as const,
            viewBackgroundColor: "#ffffff",
            viewModeEnabled: true,
          },
        }}
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        viewModeEnabled={true}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: false,
            saveAsImage: false,
            toggleTheme: false,
          },
        }}
      />
    </div>
  );
}
