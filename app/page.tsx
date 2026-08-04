"use client";

import { useState } from "react";
import { Toolbar } from "./components/Toolbar";
import { StoryEditor } from "./components/StoryEditor";
import { SlideEditor } from "./components/SlideEditor";
import { SlideViewer } from "./components/SlideViewer";
import { SlideThumbnails } from "./components/SlideThumbnails";
import { TemplateSelector } from "./components/TemplateSelector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TemplateEditor } from "./components/TemplateEditor";
import { GanttBuilder } from "./components/GanttBuilder";
import { Wand2, Pencil, Palette, BarChart3 } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState("story");

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Toolbar />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Editor tabs */}
        <div className="flex flex-col h-full border-r" style={{ width: "380px", minWidth: "300px", maxWidth: "50vw" }}>
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
              </TabsList>
            </div>
            <TabsContent value="story" className="flex-1 overflow-hidden mt-0">
              <StoryEditor />
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
          </Tabs>
        </div>

        {/* Middle panel: Thumbnails + Templates */}
        <div className="flex flex-col h-full border-r" style={{ width: "220px", minWidth: "180px", maxWidth: "30vw" }}>
          <div className="flex-1 overflow-hidden">
            <SlideThumbnails />
          </div>
          <div className="border-t">
            <TemplateSelector />
          </div>
        </div>

        {/* Right panel: Preview */}
        <div className="flex flex-col h-full flex-1">
          <SlideViewer />
        </div>
      </div>
    </div>
  );
}
