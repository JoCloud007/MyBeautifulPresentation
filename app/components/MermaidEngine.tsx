"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

interface MermaidEngineProps {
  code: string;
  className?: string;
}

export function MermaidEngine({ code, className = "" }: MermaidEngineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "strict",
    });
  }, []);

  useEffect(() => {
    if (!code.trim()) {
      setSvg(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const render = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg: renderedSvg } = await mermaid.render(id, code.trim());
        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setSvg(null);
        }
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 ${className}`}>
        <div className="text-sm text-destructive font-medium mb-2">Erreur de rendu du diagramme</div>
        <pre className="text-xs text-muted-foreground bg-muted p-3 rounded-lg overflow-auto max-w-full">
          {error}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className={`flex items-center justify-center p-6 ${className}`}>
        <div className="text-sm text-muted-foreground">Aucun diagramme à afficher</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex items-center justify-center p-4 overflow-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
