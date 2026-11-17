"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SettingsDialog } from "../settings/SettingsDialog";
import { PresentationManager } from "./PresentationManager";
import { useLlmStore } from "@/app/stores/llmStore";
import { usePresentationStore } from "@/app/stores/presentationStore";
import { checkLlmAvailability } from "@/lib/llm";
import { type HtmlPptxExportMode } from "@/lib/htmlExport/exportHtmlPptx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  onExport?: (mode: HtmlPptxExportMode) => void;
  onOpenTemplates?: () => void;
}

function StatusDot({ status, label }: { status: "ok" | "ko" | "unknown"; label: string }) {
  const color =
    status === "ok"
      ? "bg-green-500"
      : status === "ko"
        ? "bg-red-500"
        : "bg-slate-300";
  return (
    <div className="flex items-center gap-1.5" title={`${label} — ${status === "ok" ? "connecté" : status === "ko" ? "déconnecté" : "non testé"}`}>
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[10px] text-slate-500 font-medium">{label}</span>
    </div>
  );
}

export function Header({ onExport, onOpenTemplates }: HeaderProps) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presentationsOpen, setPresentationsOpen] = useState(false);
  const { config, isAvailable } = useLlmStore();
  const [aiStatus, setAiStatus] = useState<"ok" | "ko" | "unknown">(
    isAvailable === true ? "ok" : isAvailable === false ? "ko" : "unknown"
  );
  const [mcpStatus, setMcpStatus] = useState<"ok" | "ko" | "unknown">("unknown");
  const { presentation, updatePresentationMeta } = usePresentationStore();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");

  // Check AI connection on mount and when config changes
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setAiStatus("unknown");
      const ok = await checkLlmAvailability(config);
      if (!cancelled) setAiStatus(ok ? "ok" : "ko");
    };
    check();
    return () => { cancelled = true; };
  }, [config]);

  // Check MCP servers
  useEffect(() => {
    let cancelled = false;
    const checkMcps = async () => {
      if (typeof window === "undefined") return;
      const saved = localStorage.getItem("mybp_mcp_servers");
      if (!saved) {
        if (!cancelled) setMcpStatus("unknown");
        return;
      }
      try {
        const mcps = JSON.parse(saved) as Array<{ url: string }>;
        if (!Array.isArray(mcps) || mcps.length === 0) {
          if (!cancelled) setMcpStatus("unknown");
          return;
        }
        const results = await Promise.all(
          mcps.map(async (mcp) => {
            try {
              const res = await fetch(`/api/mcp/health?url=${encodeURIComponent(mcp.url)}`);
              const data = await res.json();
              return data.ok;
            } catch {
              return false;
            }
          })
        );
        const anyOk = results.some((r) => r);
        if (!cancelled) setMcpStatus(anyOk ? "ok" : "ko");
      } catch {
        if (!cancelled) setMcpStatus("unknown");
      }
    };
    checkMcps();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <header className="flex items-center justify-between px-8 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-900 rounded-md flex items-center justify-center text-white font-bold text-sm">
            M
          </div>
          <a
            href="/"
            className="text-base font-bold text-slate-900 hover:text-slate-700 cursor-pointer transition-colors"
            onClick={(e) => {
              e.preventDefault();
              router.push("/");
            }}
          >
            MyBeautifulPresentation
          </a>
          {presentation && (
            <div className="ml-4">
              {isEditingTitle ? (
                <input
                  autoFocus
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={() => {
                    if (titleValue.trim()) {
                      updatePresentationMeta({ title: titleValue.trim() });
                    }
                    setIsEditingTitle(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (titleValue.trim()) {
                        updatePresentationMeta({ title: titleValue.trim() });
                      }
                      setIsEditingTitle(false);
                    }
                    if (e.key === "Escape") {
                      setIsEditingTitle(false);
                    }
                  }}
                  className="px-2 py-1 text-sm font-semibold text-slate-700 border border-slate-300 rounded outline-none focus:border-slate-500"
                />
              ) : (
                <span
                  onClick={() => {
                    setTitleValue(presentation.title || "");
                    setIsEditingTitle(true);
                  }}
                  className="text-sm font-semibold text-slate-700 cursor-pointer hover:text-slate-900 border-b border-dashed border-slate-300 hover:border-slate-500 transition-colors"
                  title="Cliquez pour modifier le titre"
                >
                  {presentation.title || "Sans titre"}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <StatusDot status={aiStatus} label="AI" />
            <StatusDot status={mcpStatus} label="MCP" />
          </div>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex gap-3 items-center">
            <button
              onClick={() => setPresentationsOpen(true)}
              className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Présentations
            </button>
            <button
              onClick={onOpenTemplates}
              className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Templates
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Paramètres
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="px-5 py-2 bg-slate-900 rounded-md text-sm font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer">
                Export PPTX
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onExport?.("design-fidelity")}>
                  Exporter (design fidèle)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport?.("native")}>
                  Exporter (natif)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <PresentationManager open={presentationsOpen} onOpenChange={setPresentationsOpen} />
    </>
  );
}
