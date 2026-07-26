"use client";

import { useState } from "react";
import { Toolbar } from "./components/Toolbar";
import { StoryEditor } from "./components/StoryEditor";
import { SlideEditor } from "./components/SlideEditor";
import { SlideViewer } from "./components/SlideViewer";
import { SlideThumbnails } from "./components/SlideThumbnails";
import { TemplateSelector } from "./components/TemplateSelector";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Wand2, Pencil } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState("story");

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Toolbar />

      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1"
      >
        {/* Left panel: Editor tabs */}
        <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
          <div className="flex flex-col h-full border-r">
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
                </TabsList>
              </div>
              <TabsContent value="story" className="flex-1 overflow-hidden mt-0">
                <StoryEditor />
              </TabsContent>
              <TabsContent value="editor" className="flex-1 overflow-hidden mt-0">
                <SlideEditor />
              </TabsContent>
            </Tabs>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Middle panel: Thumbnails + Templates */}
        <ResizablePanel defaultSize={15} minSize={12} maxSize={25}>
          <div className="flex flex-col h-full border-r">
            <div className="flex-1 overflow-hidden">
              <SlideThumbnails />
            </div>
            <div className="border-t">
              <TemplateSelector />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right panel: Preview */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <div className="flex flex-col h-full">
            <SlideViewer />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
