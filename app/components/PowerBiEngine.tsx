"use client";

import { PowerBiConfig } from "@/app/types/presentation";

export type RenderMode = "edit" | "preview" | "export";

interface PowerBiEngineProps {
  config: PowerBiConfig;
  mode: RenderMode;
  className?: string;
}

export function PowerBiEngine({ config, mode, className = "" }: PowerBiEngineProps) {
  const { embedUrl, pageName, title } = config;

  // Build the final URL with pageName if provided
  const finalUrl = (() => {
    if (!embedUrl) return "";
    try {
      const url = new URL(embedUrl);
      if (pageName) {
        url.searchParams.set("pageName", pageName);
      }
      return url.toString();
    } catch {
      return embedUrl;
    }
  })();

  // Export mode: show placeholder since we can't screenshot cross-origin iframe client-side
  if (mode === "export" || !finalUrl) {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center bg-slate-100 border border-slate-300 ${className}`}
      >
        <svg
          className="w-10 h-10 text-slate-400 mb-2"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
          <rect x="12" y="12" width="6" height="6" rx="1" />
        </svg>
        <span className="text-xs font-medium text-slate-500">{title || "Rapport Power BI"}</span>
        {finalUrl && (
          <span className="text-[10px] text-slate-400 mt-1 truncate max-w-[80%]">{finalUrl}</span>
        )}
      </div>
    );
  }

  // Edit / Preview mode: render live iframe
  return (
    <iframe
      src={finalUrl}
      title={title || "Power BI Report"}
      className={`w-full h-full border-0 ${className}`}
      allowFullScreen
    />
  );
}
