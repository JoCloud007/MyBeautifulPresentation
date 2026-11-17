"use client";

import { useState, useCallback, useEffect } from "react";
import { usePresentationStore } from "@/app/stores/presentationStore";
import { PowerBiConfig, SlideElement } from "@/app/types/presentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2, BarChart3, Globe, Shield } from "lucide-react";
import { PowerBiEngine } from "@/app/components/PowerBiEngine";

function parsePowerBiUrl(url: string): { mode: PowerBiConfig["mode"]; reportId?: string; embedUrl: string } | null {
  if (!url.trim()) return null;
  try {
    const urlObj = new URL(url);
    // Publish to web: /view?r=...
    if (urlObj.pathname === "/view" && urlObj.searchParams.has("r")) {
      return { mode: "publish-to-web", embedUrl: url.trim() };
    }
    // Secure embed: /reportEmbed?reportId=...
    if (urlObj.pathname === "/reportEmbed") {
      const reportId = urlObj.searchParams.get("reportId") || undefined;
      return { mode: "secure-embed", reportId, embedUrl: url.trim() };
    }
    // Full report URL: /groups/.../reports/.../ReportSection...
    const reportMatch = urlObj.pathname.match(/\/reports\/([a-f0-9\-]+)/i);
    if (reportMatch) {
      const reportId = reportMatch[1];
      const embedUrl = `https://app.powerbi.com/reportEmbed?reportId=${reportId}&autoAuth=true`;
      return { mode: "secure-embed", reportId, embedUrl };
    }
    return null;
  } catch {
    return null;
  }
}

function extractPageName(url: string): string | undefined {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart && lastPart.startsWith("ReportSection")) {
      return lastPart;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const DEFAULT_CONFIG: PowerBiConfig = {
  embedUrl: "",
  title: "Rapport Power BI",
  mode: "publish-to-web",
};

export function PowerBiView() {
  const { currentSlideIndex, addSlideElement, presentation } = usePresentationStore();
  const [urlInput, setUrlInput] = useState("");
  const [config, setConfig] = useState<PowerBiConfig>(DEFAULT_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load existing powerbi element from current slide if any
  useEffect(() => {
    const slide = presentation?.slides[currentSlideIndex];
    if (!slide?.elements) return;
    const powerbiElement = slide.elements.find((el) => el.type === "powerbi");
    if (powerbiElement?.content) {
      try {
        const parsed = JSON.parse(powerbiElement.content) as PowerBiConfig;
        setConfig(parsed);
        setUrlInput(parsed.embedUrl);
      } catch {
        // ignore parse errors
      }
    } else {
      setConfig(DEFAULT_CONFIG);
      setUrlInput("");
    }
  }, [currentSlideIndex, presentation]);

  const handleLoad = useCallback(() => {
    setError(null);
    setIsLoading(true);

    const parsed = parsePowerBiUrl(urlInput);
    if (!parsed) {
      setError("URL Power BI non reconnue. Utilisez un lien 'Publish to web' ou 'Embed'.");
      setIsLoading(false);
      return;
    }

    const pageName = extractPageName(urlInput);

    setConfig({
      embedUrl: parsed.embedUrl,
      reportId: parsed.reportId,
      pageName: pageName || config.pageName,
      title: config.title || "Rapport Power BI",
      mode: parsed.mode,
    });
    setIsLoading(false);
  }, [urlInput, config.title, config.pageName]);

  const handleInsert = useCallback(() => {
    if (!config.embedUrl) {
      setError("Veuillez d'abord charger une URL valide.");
      return;
    }

    const element: SlideElement = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      type: "powerbi",
      subtype: config.mode,
      x: 5,
      y: 10,
      w: 90,
      h: 75,
      content: JSON.stringify(config),
      style: { borderWidth: 1, borderColor: "#94a3b8" },
    };

    addSlideElement(currentSlideIndex, element);
  }, [config, currentSlideIndex, addSlideElement]);

  const isValid = !!config.embedUrl;

  return (
    <div className="flex flex-col h-full">
      {/* Split pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Configuration */}
        <div className="w-1/2 border-r border-slate-200 flex flex-col p-4 gap-4 overflow-auto">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Power BI</span>
          </div>

          {/* URL Input */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">URL du rapport</Label>
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://app.powerbi.com/view?r=..."
                className="text-xs flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLoad();
                }}
              />
              <Button size="sm" onClick={handleLoad} disabled={!urlInput.trim()}>
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Charger"}
              </Button>
            </div>
            <p className="text-[10px] text-slate-400">
              Collez un lien &quot;Publish to web&quot; ou &quot;Embed&quot; depuis Power BI Service.
            </p>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
              {error}
            </div>
          )}

          {isValid && (
            <>
              {/* Mode badge */}
              <div className="flex items-center gap-2">
                {config.mode === "publish-to-web" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-200">
                    <Globe className="h-3 w-3" />
                    Publish to Web
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200">
                    <Shield className="h-3 w-3" />
                    Secure Embed
                  </span>
                )}
                {config.reportId && (
                  <span className="text-[10px] text-slate-400">
                    ID: {config.reportId.slice(0, 8)}...
                  </span>
                )}
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Titre</Label>
                <Input
                  value={config.title}
                  onChange={(e) => setConfig((c) => ({ ...c, title: e.target.value }))}
                  placeholder="Titre du rapport"
                  className="text-xs"
                />
              </div>

              {/* Page name */}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Page (optionnel)</Label>
                <Input
                  value={config.pageName || ""}
                  onChange={(e) => setConfig((c) => ({ ...c, pageName: e.target.value || undefined }))}
                  placeholder="Ex: ReportSection1"
                  className="text-xs"
                />
                <p className="text-[10px] text-slate-400">
                  Nom technique de la page à afficher par défaut.
                </p>
              </div>

              <div className="mt-auto pt-4">
                <Button onClick={handleInsert} className="w-full" size="sm">
                  <Save className="mr-2 h-4 w-4" />
                  Ajouter à la slide
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Right: Preview */}
        <div className="w-1/2 flex flex-col">
          <div className="px-4 py-2 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-700">Aperçu</span>
          </div>
          <div className="flex-1 p-4 bg-slate-50 overflow-auto">
            {isValid ? (
              <div className="w-full h-full min-h-[300px] bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
                <PowerBiEngine config={config} mode="preview" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-slate-400">
                Entrez une URL et cliquez sur Charger pour prévisualiser
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
