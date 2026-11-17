"use client";

import { useState } from "react";
import { DiagramBuilder } from "./DiagramBuilder";
import { ExcalidrawBuilder } from "./ExcalidrawBuilder";
import { RoadmapBuilder } from "./RoadmapBuilder";
import { Button } from "@/components/ui/button";
import { GitBranch, PenTool, BarChart3 } from "lucide-react";

type VisualTab = "mermaid" | "excalidraw" | "roadmap";

export function VisualBuilder() {
  const [activeTab, setActiveTab] = useState<VisualTab>("mermaid");

  return (
    <div className="flex flex-col h-full bg-transparent text-foreground overflow-hidden">
      {/* Header with sub-tabs */}
      <div className="border-b px-4 py-3 space-y-3 shrink-0">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Studio Visuel
          </h3>
          <p className="text-xs text-white/40">
            Créez des schémas, diagrammes et roadmaps pour enrichir vos slides.
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant={activeTab === "mermaid" ? "default" : "outline"}
            onClick={() => setActiveTab("mermaid")}
            className="gap-1.5"
          >
            <GitBranch className="h-3.5 w-3.5" />
            Schémas (Mermaid)
          </Button>
          <Button
            size="xs"
            variant={activeTab === "excalidraw" ? "default" : "outline"}
            onClick={() => setActiveTab("excalidraw")}
            className="gap-1.5"
          >
            <PenTool className="h-3.5 w-3.5" />
            Excalidraw
          </Button>
          <Button
            size="xs"
            variant={activeTab === "roadmap" ? "default" : "outline"}
            onClick={() => setActiveTab("roadmap")}
            className="gap-1.5"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Roadmap / GANTT
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "mermaid" && <DiagramBuilder />}
        {activeTab === "excalidraw" && <ExcalidrawBuilder />}
        {activeTab === "roadmap" && <RoadmapBuilder />}
      </div>
    </div>
  );
}
