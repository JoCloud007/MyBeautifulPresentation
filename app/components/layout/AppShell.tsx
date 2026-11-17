"use client";

import { ReactNode } from "react";
import { Header } from "./Header";
import { type HtmlPptxExportMode } from "@/lib/htmlExport/exportHtmlPptx";

interface AppShellProps {
  children: ReactNode;
  onExport?: (mode: HtmlPptxExportMode) => void;
  onOpenTemplates?: () => void;
}

export function AppShell({ children, onExport, onOpenTemplates }: AppShellProps) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100">
      <Header onExport={onExport} onOpenTemplates={onOpenTemplates} />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
