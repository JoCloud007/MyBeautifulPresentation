"use client";

import { Slide } from "../types/presentation";
import { Template } from "../types/template";
import { cn } from "@/lib/utils";
import { GanttEngine } from "./GanttEngine";
import { TimelineEngine } from "./TimelineEngine";
import { MermaidEngine } from "./MermaidEngine";
import { ExcalidrawEngine } from "./ExcalidrawEngine";
import { parseGanttContent, parseTimelineContent } from "@/lib/ganttParser";

export interface SlideEngineProps {
  slide: Slide;
  template: Template;
  scale?: number;
  className?: string;
  interactive?: boolean;
}

/**
 * Professional slide rendering engine.
 * Renders a slide with full template styling at any scale.
 */
export function SlideEngine({
  slide,
  template,
  scale = 1,
  className,
  interactive = false,
}: SlideEngineProps) {
  const { colors, fonts, background, header, footer } = template;
  const isMini = scale < 0.5;

  const bg = background || { type: "color" as const, color: colors.background, opacity: 100 };
  const hdr = header || { text: "", enabled: false, showDate: false };
  const ftr = footer || { text: "", enabled: false, showPageNumber: false, showDate: false };

  const showHeader = hdr.enabled && !isMini;
  const showFooter = ftr.enabled && !isMini;
  const headerHeight = showHeader ? 28 : 0;
  const footerHeight = showFooter ? 24 : 0;

  const baseStyle: React.CSSProperties = {
    fontFamily: fonts.body,
    backgroundColor: bg.type === "color" ? bg.color : colors.background,
    color: colors.foreground,
  };

  return (
    <div
      className={cn("w-full h-full overflow-hidden relative", className)}
      style={baseStyle}
      data-layout={slide.layout}
      data-interactive={interactive}
    >
      {/* Background image layer */}
      {bg.type === "image" && bg.imageUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none"
          style={{
            backgroundImage: `url(${bg.imageUrl})`,
            opacity: (bg.opacity || 100) / 100,
          }}
        />
      )}

      {/* Header */}
      {showHeader && (
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-[4%] text-[10px]"
          style={{
            height: headerHeight,
            color: colors.secondary,
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.background,
          }}
        >
          <span style={{ fontFamily: fonts.body }}>{hdr.text}</span>
          {hdr.showDate && (
            <span style={{ fontFamily: fonts.body }}>
              {new Date().toLocaleDateString("fr-FR")}
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div
        className="relative z-0 h-full"
        style={{
          paddingTop: headerHeight,
          paddingBottom: footerHeight,
        }}
      >
        <LayoutRenderer
          slide={slide}
          template={template}
          scale={scale}
        />
      </div>

      {/* Footer */}
      {showFooter && (
        <div
          className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center text-[10px]"
          style={{
            height: footerHeight,
            color: colors.secondary,
            borderTop: `1px solid ${colors.border}`,
            backgroundColor: colors.background,
          }}
        >
          <span style={{ fontFamily: fonts.body }}>
            {ftr.text}
            {ftr.showPageNumber && " · {page} / {total}"}
            {ftr.showDate && ` · ${new Date().toLocaleDateString("fr-FR")}`}
          </span>
        </div>
      )}
    </div>
  );
}

function LayoutRenderer({
  slide,
  template,
  scale,
}: {
  slide: Slide;
  template: Template;
  scale: number;
}) {
  const { colors, fonts } = template;

  const headingStyle: React.CSSProperties = {
    fontFamily: fonts.heading,
    color: colors.foreground,
  };

  const bodyStyle: React.CSSProperties = {
    fontFamily: fonts.body,
    color: colors.foreground,
  };

  const secondaryStyle: React.CSSProperties = {
    color: colors.secondary,
  };

  const accentBarStyle: React.CSSProperties = {
    backgroundColor: colors.accent,
  };

  const isMini = scale < 0.5;

  switch (slide.layout) {
    case "title":
      return (
        <div className="flex flex-col items-center justify-center h-full px-[8%] text-center relative">
          {!isMini && (
            <div
              className="absolute top-0 left-0 w-full h-1"
              style={accentBarStyle}
            />
          )}
          <h1
            className={cn(
              "font-bold leading-tight",
              isMini ? "text-[8px]" : "text-[clamp(1.5rem,3.5vw,3rem)]"
            )}
            style={headingStyle}
          >
            {slide.title}
          </h1>
          {slide.content && (
            <p
              className={cn(
                "mt-[3%] leading-relaxed",
                isMini ? "text-[6px]" : "text-[clamp(0.875rem,1.5vw,1.25rem)]"
              )}
              style={{ ...bodyStyle, ...secondaryStyle }}
            >
              {slide.content}
            </p>
          )}
          {!isMini && (
            <div
              className="absolute bottom-[8%] w-16 h-0.5 rounded-full"
              style={{ backgroundColor: colors.accent, opacity: 0.4 }}
            />
          )}
        </div>
      );

    case "title-only":
      return (
        <div className="flex items-center h-full px-[8%] relative">
          {!isMini && (
            <div
              className="absolute left-0 top-[15%] bottom-[15%] w-1 rounded-r"
              style={accentBarStyle}
            />
          )}
          <h1
            className={cn(
              "font-bold leading-tight",
              isMini ? "text-[8px]" : "text-[clamp(1.75rem,4vw,3.5rem)]"
            )}
            style={headingStyle}
          >
            {slide.title}
          </h1>
        </div>
      );

    case "content-only":
      return (
        <div className="flex items-center h-full px-[8%] relative">
          {!isMini && (
            <div
              className="absolute top-[8%] left-[8%] right-[8%] h-0.5 rounded-full"
              style={{ backgroundColor: colors.accent, opacity: 0.3 }}
            />
          )}
          <div
            className={cn(
              "whitespace-pre-wrap leading-relaxed w-full",
              isMini ? "text-[6px]" : "text-[clamp(0.8rem,1.4vw,1.1rem)]"
            )}
            style={bodyStyle}
          >
            {slide.content}
          </div>
        </div>
      );

    case "two-column": {
      const pipeIndex = slide.content.indexOf("|");
      const leftContent = pipeIndex >= 0 ? slide.content.slice(0, pipeIndex).trim() : slide.content;
      const rightContent = pipeIndex >= 0 ? slide.content.slice(pipeIndex + 1).trim() : "";
      return (
        <div className="flex flex-col h-full px-[6%] py-[5%]">
          <h2
            className={cn(
              "font-bold mb-[3%]",
              isMini ? "text-[7px]" : "text-[clamp(1.25rem,2.5vw,2rem)]"
            )}
            style={headingStyle}
          >
            {slide.title}
          </h2>
          {!isMini && (
            <div
              className="w-12 h-0.5 rounded-full mb-[4%]"
              style={{ backgroundColor: colors.accent, opacity: 0.5 }}
            />
          )}
          <div className="flex gap-[4%] flex-1 overflow-hidden">
            <div
              className={cn(
                "flex-1 whitespace-pre-wrap leading-relaxed overflow-hidden",
                isMini ? "text-[5px]" : "text-[clamp(0.7rem,1.2vw,0.95rem)]"
              )}
              style={bodyStyle}
            >
              {leftContent}
            </div>
            <div
              className="w-px flex-shrink-0"
              style={{ backgroundColor: colors.border }}
            />
            <div
              className={cn(
                "flex-1 whitespace-pre-wrap leading-relaxed overflow-hidden",
                isMini ? "text-[5px]" : "text-[clamp(0.7rem,1.2vw,0.95rem)]"
              )}
              style={bodyStyle}
            >
              {rightContent}
            </div>
          </div>
        </div>
      );
    }

    case "image-left":
      return (
        <div className="flex h-full">
          <div
            className="w-[40%] h-full flex items-center justify-center relative"
            style={{ backgroundColor: colors.muted }}
          >
            <div
              className="text-center px-4"
              style={secondaryStyle}
            >
              <svg
                className="w-12 h-12 mx-auto opacity-30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M9 12.75l3.75-3.75M15 10.5l-3.75 3.75"
                />
              </svg>
              <span className={cn("block mt-2", isMini ? "text-[5px]" : "text-xs")}>
                Image
              </span>
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center px-[6%]">
            <h2
              className={cn(
                "font-bold mb-[3%]",
                isMini ? "text-[7px]" : "text-[clamp(1.1rem,2vw,1.6rem)]"
              )}
              style={headingStyle}
            >
              {slide.title}
            </h2>
            <div
              className={cn(
                "whitespace-pre-wrap leading-relaxed",
                isMini ? "text-[5px]" : "text-[clamp(0.7rem,1.1vw,0.9rem)]"
              )}
              style={bodyStyle}
            >
              {slide.content}
            </div>
          </div>
        </div>
      );

    case "image-right":
      return (
        <div className="flex h-full">
          <div className="flex-1 flex flex-col justify-center px-[6%]">
            <h2
              className={cn(
                "font-bold mb-[3%]",
                isMini ? "text-[7px]" : "text-[clamp(1.1rem,2vw,1.6rem)]"
              )}
              style={headingStyle}
            >
              {slide.title}
            </h2>
            <div
              className={cn(
                "whitespace-pre-wrap leading-relaxed",
                isMini ? "text-[5px]" : "text-[clamp(0.7rem,1.1vw,0.9rem)]"
              )}
              style={bodyStyle}
            >
              {slide.content}
            </div>
          </div>
          <div
            className="w-[40%] h-full flex items-center justify-center relative"
            style={{ backgroundColor: colors.muted }}
          >
            <div className="text-center px-4" style={secondaryStyle}>
              <svg
                className="w-12 h-12 mx-auto opacity-30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M9 12.75l3.75-3.75M15 10.5l-3.75 3.75"
                />
              </svg>
              <span className={cn("block mt-2", isMini ? "text-[5px]" : "text-xs")}>
                Image
              </span>
            </div>
          </div>
        </div>
      );

    case "timeline": {
      const events = slide.data?.timeline?.events ?? parseTimelineContent(slide.content);
      return (
        <div className="flex flex-col h-full px-[6%] py-[5%]">
          <h2
            className={cn(
              "font-bold mb-[2%]",
              isMini ? "text-[7px]" : "text-[clamp(1rem,2vw,1.6rem)]"
            )}
            style={headingStyle}
          >
            {slide.title}
          </h2>
          {!isMini && (
            <div
              className="w-10 h-0.5 rounded-full mb-[3%]"
              style={{ backgroundColor: colors.accent, opacity: 0.5 }}
            />
          )}
          <div className="flex-1 overflow-hidden">
            <TimelineEngine events={events} colors={colors} fonts={fonts} scale={scale} />
          </div>
        </div>
      );
    }

    case "gantt": {
      const tasks = slide.data?.gantt?.tasks ?? parseGanttContent(slide.content);
      return (
        <div className="flex flex-col h-full px-[5%] py-[4%]">
          <h2
            className={cn(
              "font-bold mb-[2%]",
              isMini ? "text-[7px]" : "text-[clamp(1rem,2vw,1.6rem)]"
            )}
            style={headingStyle}
          >
            {slide.title}
          </h2>
          {!isMini && (
            <div
              className="w-10 h-0.5 rounded-full mb-[2%]"
              style={{ backgroundColor: colors.accent, opacity: 0.5 }}
            />
          )}
          <div className="flex-1 overflow-hidden">
            <GanttEngine tasks={tasks} colors={colors} fonts={fonts} scale={scale} />
          </div>
        </div>
      );
    }

    case "mermaid": {
      const mermaidCode = slide.content;
      return (
        <div className="flex flex-col h-full px-[5%] py-[4%]">
          <h2
            className={cn(
              "font-bold mb-[2%]",
              isMini ? "text-[7px]" : "text-[clamp(1rem,2vw,1.6rem)]"
            )}
            style={headingStyle}
          >
            {slide.title}
          </h2>
          {!isMini && (
            <div
              className="w-10 h-0.5 rounded-full mb-[2%]"
              style={{ backgroundColor: colors.accent, opacity: 0.5 }}
            />
          )}
          <div className="flex-1 overflow-hidden">
            <MermaidEngine code={mermaidCode} className="h-full w-full" />
          </div>
        </div>
      );
    }

    case "excalidraw": {
      const excalidrawData = slide.content || "{}";
      return (
        <div className="flex flex-col h-full px-[5%] py-[4%]">
          <h2
            className={cn(
              "font-bold mb-[2%]",
              isMini ? "text-[7px]" : "text-[clamp(1rem,2vw,1.6rem)]"
            )}
            style={headingStyle}
          >
            {slide.title}
          </h2>
          {!isMini && (
            <div
              className="w-10 h-0.5 rounded-full mb-[2%]"
              style={{ backgroundColor: colors.accent, opacity: 0.5 }}
            />
          )}
          <div className="flex-1 overflow-hidden">
            <ExcalidrawEngine data={excalidrawData} className="h-full w-full" />
          </div>
        </div>
      );
    }

    case "title-content":
    default:
      return (
        <div className="flex flex-col h-full px-[6%] py-[5%]">
          <h2
            className={cn(
              "font-bold mb-[2%]",
              isMini ? "text-[7px]" : "text-[clamp(1.25rem,2.5vw,2rem)]"
            )}
            style={headingStyle}
          >
            {slide.title}
          </h2>
          {!isMini && (
            <div
              className="w-10 h-0.5 rounded-full mb-[3%]"
              style={{ backgroundColor: colors.accent, opacity: 0.5 }}
            />
          )}
          <div
            className={cn(
              "flex-1 whitespace-pre-wrap leading-relaxed overflow-hidden",
              isMini ? "text-[5px]" : "text-[clamp(0.75rem,1.3vw,1rem)]"
            )}
            style={bodyStyle}
          >
            {slide.content}
          </div>
        </div>
      );
  }
}

/**
 * Mini thumbnail render for use in thumbnail grids.
 */
export function MiniSlideEngine({
  slide,
  template,
}: {
  slide: Slide;
  template: Template;
}) {
  return (
    <SlideEngine
      slide={slide}
      template={template}
      scale={0.15}
      className="rounded"
    />
  );
}
