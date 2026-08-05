"use client";

import { useState, useEffect, useCallback } from "react";
import { Toolbar } from "./components/Toolbar";
import { StoryEditor } from "./components/StoryEditor";
import { SlideEditor } from "./components/SlideEditor";
import { SlideViewer } from "./components/SlideViewer";
import { SlideThumbnails } from "./components/SlideThumbnails";
import { TemplateSelector } from "./components/TemplateSelector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TemplateEditor } from "./components/TemplateEditor";
import { GanttBuilder } from "./components/GanttBuilder";
import { Wand2, Pencil, Palette, BarChart3, MessageCircle, Lightbulb, GitBranch } from "lucide-react";
import { StoryInterview } from "./components/StoryInterview";
import { StoryBrainstorming } from "./components/StoryBrainstorming";
import { DiagramBuilder } from "./components/DiagramBuilder";

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      onResize(e.movementX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`w-1 h-full flex-shrink-0 hover:bg-primary/30 active:bg-primary/50 cursor-col-resize transition-colors ${
        isDragging ? "bg-primary/50" : "bg-transparent"
      }`}
      style={{ cursor: "col-resize" }}
    />
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("story");
  const [leftWidth, setLeftWidth] = useState(380);
  const [middleWidth, setMiddleWidth] = useState(220);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Toolbar />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Editor tabs */}
        <div className="flex flex-col h-full border-r" style={{ width: leftWidth, minWidth: 250, maxWidth: "50vw" }}>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col h-full"
          >
            <div className="border-b px-3 pt-2 pb-0">
              <TabsList variant="line" className="w-full justify-start gap-0">
                <TabsTrigger value="story" className="gap-1.5 text-xs">
                  <Wand2 className="h-3.5 w-3.5" />
                  Storytelling
                </TabsTrigger>
                <TabsTrigger value="interview" className="gap-1.5 text-xs">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Interview
                </TabsTrigger>
                <TabsTrigger value="brainstorm" className="gap-1.5 text-xs">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Brainstorming
                </TabsTrigger>
                <TabsTrigger value="editor" className="gap-1.5 text-xs">
                  <Pencil className="h-3.5 w-3.5" />
                  Éditeur
                </TabsTrigger>
                <TabsTrigger value="template" className="gap-1.5 text-xs">
                  <Palette className="h-3.5 w-3.5" />
                  Template
                </TabsTrigger>
                <TabsTrigger value="gantt" className="gap-1.5 text-xs">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Timeline/GANTT
                </TabsTrigger>
                <TabsTrigger value="diagram" className="gap-1.5 text-xs">
                  <GitBranch className="h-3.5 w-3.5" />
                  Schémas
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="story" className="flex-1 overflow-hidden mt-0">
              <StoryEditor />
            </TabsContent>
            <TabsContent value="interview" className="flex-1 overflow-hidden mt-0">
              <StoryInterview />
            </TabsContent>
            <TabsContent value="brainstorm" className="flex-1 overflow-hidden mt-0">
              <StoryBrainstorming />
            </TabsContent>
            <TabsContent value="editor" className="flex-1 overflow-hidden mt-0">
              <SlideEditor onOpenBuilder={() => setActiveTab("gantt")} />
            </TabsContent>
            <TabsContent value="template" className="flex-1 overflow-hidden mt-0">
              <TemplateEditor />
            </TabsContent>
            <TabsContent value="gantt" className="flex-1 overflow-hidden mt-0">
              <GanttBuilder />
            </TabsContent>
            <TabsContent value="diagram" className="flex-1 overflow-hidden mt-0">
              <DiagramBuilder />
            </TabsContent>
          </Tabs>
        </div>

        <ResizeHandle onResize={(dx) => setLeftWidth((w) => Math.max(250, Math.min(window.innerWidth * 0.5, w + dx)))} />

        {/* Middle panel: Thumbnails + Templates */}
        <div className="flex flex-col h-full border-r" style={{ width: middleWidth, minWidth: 150, maxWidth: "30vw" }}>
          <div className="flex-1 overflow-hidden">
            <SlideThumbnails />
          </div>
          <div className="border-t">
            <TemplateSelector />
          </div>
        </div>

        <ResizeHandle onResize={(dx) => setMiddleWidth((w) => Math.max(150, Math.min(window.innerWidth * 0.3, w + dx)))} />

        {/* Right panel: Preview */}
        <div className="flex flex-col h-full flex-1">
          <SlideViewer />
        </div>
      </div>
    </div>
  );
}
