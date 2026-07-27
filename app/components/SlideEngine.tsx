"use client";

import { Slide } from "../types/presentation";
import { Template } from "../types/template";
import { cn } from "@/lib/utils";

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
  const { colors, fonts } = template;

  const baseStyle: React.CSSProperties = {
    fontFamily: fonts.body,
    backgroundColor: colors.background,
    color: colors.foreground,
  };

  return (
    <div
      className={cn("w-full h-full overflow-hidden", className)}
      style={baseStyle}
      data-layout={slide.layout}
      data-interactive={interactive}
    >
      <LayoutRenderer
        slide={slide}
        template={template}
        scale={scale}
      />
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
      const events = slide.content
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const total = events.length || 1;
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
          <div className="flex-1 relative flex items-center">
            {/* Horizontal line */}
            <div
              className="absolute left-[4%] right-[4%] h-0.5 rounded-full"
              style={{ backgroundColor: colors.border }}
            />
            {/* Active segment */}
            <div
              className="absolute left-[4%] h-0.5 rounded-full"
              style={{
                width: total > 1 ? `${((total - 1) / total) * 92}%` : "0%",
                backgroundColor: colors.accent,
              }}
            />
            {/* Events */}
            <div className="relative w-full flex justify-between px-[4%]">
              {events.map((evt, i) => {
                const sep = evt.indexOf(" - ");
                const date = sep >= 0 ? evt.slice(0, sep).trim() : "";
                const desc = sep >= 0 ? evt.slice(sep + 3).trim() : evt;
                const isAbove = i % 2 === 0;
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center"
                    style={{ width: `${90 / total}%` }}
                  >
                    {isAbove && !isMini && (
                      <>
                        <span
                          className="text-[10px] font-semibold leading-tight text-center"
                          style={{ color: colors.accent }}
                        >
                          {date}
                        </span>
                        <span
                          className="text-[9px] leading-tight text-center mt-0.5"
                          style={secondaryStyle}
                        >
                          {desc}
                        </span>
                        <div
                          className="w-px h-3 mt-1"
                          style={{ backgroundColor: colors.border }}
                        />
                      </>
                    )}
                    <div
                      className={cn(
                        "rounded-full flex-shrink-0",
                        isMini ? "w-1.5 h-1.5" : "w-3 h-3"
                      )}
                      style={{
                        backgroundColor: colors.accent,
                        border: `2px solid ${colors.background}`,
                      }}
                    />
                    {!isAbove && !isMini && (
                      <>
                        <div
                          className="w-px h-3 mb-1"
                          style={{ backgroundColor: colors.border }}
                        />
                        <span
                          className="text-[10px] font-semibold leading-tight text-center"
                          style={{ color: colors.accent }}
                        >
                          {date}
                        </span>
                        <span
                          className="text-[9px] leading-tight text-center mt-0.5"
                          style={secondaryStyle}
                        >
                          {desc}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    case "gantt": {
      const tasks = slide.content
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const parts = l.split("|").map((p) => p.trim());
          return {
            name: parts[0] || "",
            start: parseFloat(parts[1]) || 0,
            duration: parseFloat(parts[2]) || 1,
            color: parts[3] || colors.accent,
          };
        });
      const maxEnd = Math.max(
        ...tasks.map((t) => t.start + t.duration),
        5
      );
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
          <div className="flex-1 flex flex-col gap-1 overflow-hidden">
            {/* Header */}
            {!isMini && (
              <div className="flex items-center gap-2 pb-1 border-b" style={{ borderColor: colors.border }}>
                <div className="w-[28%] text-[10px] font-semibold" style={secondaryStyle}>
                  Tâche
                </div>
                <div className="flex-1 flex justify-between text-[9px]" style={secondaryStyle}>
                  {Array.from({ length: maxEnd + 1 }, (_, i) => (
                    <span key={i} className="w-6 text-center">{i}</span>
                  ))}
                </div>
              </div>
            )}
            {/* Task rows */}
            {tasks.map((task, i) => (
              <div
                key={i}
                className="flex items-center gap-2 py-0.5"
                style={{
                  borderBottom: `1px solid ${colors.border}`,
                  opacity: 0.9,
                }}
              >
                <div
                  className={cn(
                    "w-[28%] truncate leading-tight",
                    isMini ? "text-[5px]" : "text-[10px]"
                  )}
                  style={bodyStyle}
                >
                  {task.name}
                </div>
                <div className="flex-1 relative h-4">
                  {!isMini && (
                    <div
                      className="absolute inset-0 flex"
                      style={{ opacity: 0.15 }}
                    >
                      {Array.from({ length: maxEnd + 1 }, (_, j) => (
                        <div
                          key={j}
                          className="flex-1 border-r"
                          style={{ borderColor: colors.border }}
                        />
                      ))}
                    </div>
                  )}
                  <div
                    className="absolute top-0.5 h-3 rounded-full"
                    style={{
                      left: `${(task.start / maxEnd) * 100}%`,
                      width: `${(task.duration / maxEnd) * 100}%`,
                      backgroundColor: task.color.startsWith("#")
                        ? task.color
                        : colors.accent,
                      minWidth: "4px",
                    }}
                  />
                </div>
              </div>
            ))}
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
