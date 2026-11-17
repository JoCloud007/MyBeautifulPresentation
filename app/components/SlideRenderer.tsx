"use client";

import { Slide, PowerBiConfig } from "../types/presentation";
import { Template } from "../types/template";
import { cn } from "@/lib/utils";
import { semanticTokens } from "@/app/design-system/tokens";
import { GanttEngine } from "./GanttEngine";
import { TimelineEngine } from "./TimelineEngine";
import { MermaidEngine } from "./MermaidEngine";
import { ExcalidrawEngine } from "./ExcalidrawEngine";
import { PowerBiEngine } from "./PowerBiEngine";
import { parseGanttContent, parseTimelineContent } from "@/lib/ganttParser";
import { isSlideThemeId, SlideThemeDecor } from "@/app/design-system/slide-themes";
import { BrandLogo } from "./brand/BrandLogo";

export type RenderMode = "edit" | "preview" | "export";

export interface SlideRendererProps {
  slide: Slide;
  template: Template;
  mode?: RenderMode;
  scale?: number;
  className?: string;
}

/**
 * Premium Slide Renderer
 * ----------------------
 * Pixel-perfect rendering engine for all slide layouts.
 * Principles:
 *  • 12-column grid for structural alignment
 *  • Typographic hierarchy (modular scale, font weights)
 *  • Generous whitespace (8-pt grid)
 *  • WCAG AA contrast on all text/background pairs
 *  • Semantic tokens for every visual value
 */
export function SlideRenderer({
  slide,
  template,
  mode = "preview",
  scale = 1,
  className,
}: SlideRendererProps) {
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

  // If slide has WYSIWYG elements, render them directly
  if (slide.elements && slide.elements.length > 0) {
    return (
      <div
        className={cn("w-full h-full overflow-hidden relative", className)}
        style={baseStyle}
        data-layout="elements"
        data-mode={mode}
        data-scale={scale}
      >
        {bg.type === "image" && bg.imageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center pointer-events-none"
            style={{
              backgroundImage: `url(${bg.imageUrl})`,
              opacity: (bg.opacity || 100) / 100,
            }}
          />
        )}
        {isSlideThemeId(template.slideTheme) && (
          <SlideThemeDecor themeId={template.slideTheme} accent={colors.accent} />
        )}
        {slide.elements.map((el) => (
          <div
            key={el.id}
            className="absolute"
            style={{
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.w}%`,
              height: `${el.h}%`,
              zIndex: el.style?.zIndex || 1,
            }}
          >
            {el.type === "text" ? (
              <div
                className="w-full h-full overflow-hidden"
                style={{
                  fontSize: el.style?.fontSize ? `${el.style.fontSize * scale}px` : `${20 * scale}px`,
                  fontFamily: el.style?.fontFamily || fonts.body,
                  fontWeight: el.style?.fontWeight || 400,
                  color: el.style?.color || colors.foreground,
                  textAlign: el.style?.textAlign || "left",
                  backgroundColor: el.style?.backgroundColor || "transparent",
                  borderRadius: el.style?.borderRadius || 0,
                  border: el.style?.borderWidth
                    ? `${el.style.borderWidth}px solid ${el.style.borderColor || "#94a3b8"}`
                    : "none",
                  padding: el.style?.padding || 8,
                  opacity: el.style?.opacity ?? 1,
                  lineHeight: 1.4,
                }}
              >
                {el.content}
              </div>
            ) : el.type === "shape" ? (
              <div
                className="w-full h-full"
                style={{
                  backgroundColor: el.style?.backgroundColor || colors.muted,
                  borderRadius: el.style?.borderRadius || 0,
                  border: el.style?.borderWidth
                    ? `${el.style.borderWidth}px solid ${el.style.borderColor || colors.border}`
                    : `1px solid ${colors.border}`,
                  opacity: el.style?.opacity ?? 1,
                }}
              />
            ) : el.type === "table" ? (
              <div className="w-full h-full p-1 overflow-auto text-xs" style={{ fontSize: `${10 * scale}px` }}>
                <table className="w-full border-collapse">
                  <tbody>
                    {(el.content || "").split("\n").map((row, ri) => (
                      <tr key={ri}>
                        {row.split("|").map((cell, ci) => (
                          <td key={ci} className="border border-slate-300 p-1" style={{ color: colors.foreground }}>
                            {cell.trim()}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : el.type === "powerbi" ? (
              (() => {
                try {
                  const config = JSON.parse(el.content || "{}") as PowerBiConfig;
                  return (
                    <div className="w-full h-full" style={{ pointerEvents: mode === "export" ? "none" : "auto" }}>
                      <PowerBiEngine config={config} mode={mode} />
                    </div>
                  );
                } catch {
                  return (
                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                      Power BI
                    </div>
                  );
                }
              })()
            ) : el.type === "image" ? (
              el.content ? (
                // CSS background rather than <img>: identical rendering, keeps
                // the off-screen capture simple (no next/image optimizer) and
                // works for both data-URLs and remote sources.
                <div
                  className="w-full h-full"
                  style={{
                    backgroundImage: `url(${el.content})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    borderRadius: el.style?.borderRadius ?? 0,
                    opacity: el.style?.opacity ?? 1,
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                  Image
                </div>
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                Image
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full h-full overflow-hidden relative",
        mode === "edit" && "ring-1 ring-[var(--primary)]/30",
        className
      )}
      style={baseStyle}
      data-layout={slide.layout}
      data-mode={mode}
      data-scale={scale}
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

      {/* Premium theme decor layer (behind the content) */}
      {isSlideThemeId(template.slideTheme) && (
        <SlideThemeDecor
          themeId={template.slideTheme}
          accent={colors.accent}
          colors={colors}
        />
      )}

      {/* Logo de charte — zone réservée, jamais au-dessus du contenu */}
      {template.logo && <BrandLogo logo={template.logo} isMini={isMini} />}

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

      {/* Content area with 12-col grid container */}
      <div
        className="relative z-0 h-full grid grid-cols-12"
        style={{
          paddingTop: headerHeight,
          paddingBottom: footerHeight,
          gap: semanticTokens.space[6],
          paddingLeft: semanticTokens.grid.margin,
          paddingRight: semanticTokens.grid.margin,
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

/* ------------------------------------------------------------------ */
/*  Layout Renderer                                                   */
/* ------------------------------------------------------------------ */

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
  const isMini = scale < 0.5;

  const headingStyle: React.CSSProperties = {
    fontFamily: fonts.heading,
    color: colors.foreground,
    lineHeight: semanticTokens.type.leading.tight,
  };

  const bodyStyle: React.CSSProperties = {
    fontFamily: fonts.body,
    color: colors.foreground,
    lineHeight: semanticTokens.type.leading.relaxed,
  };

  const secondaryStyle: React.CSSProperties = {
    color: colors.secondary,
  };

  const accentBarStyle: React.CSSProperties = {
    backgroundColor: colors.accent,
  };

  switch (slide.layout) {
    case "title":
      return (
        <div className="col-span-12 flex flex-col items-center justify-center text-center relative py-[8%]">
          {!isMini && (
            <div className="absolute top-0 left-0 w-full h-1" style={accentBarStyle} />
          )}
          <h1
            className={cn(
              "font-bold",
              isMini ? "text-[8px]" : "text-[clamp(1.75rem,4vw,3.5rem)]"
            )}
            style={headingStyle}
          >
            {slide.title}
          </h1>
          {slide.content && (
            <p
              className={cn(
                "mt-[3%] max-w-[66%]",
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
        <div className="col-span-12 flex items-center relative py-[8%]">
          {!isMini && (
            <div
              className="absolute left-0 top-[15%] bottom-[15%] w-1 rounded-r"
              style={accentBarStyle}
            />
          )}
          <h1
            className={cn(
              "font-bold",
              isMini ? "text-[8px]" : "text-[clamp(1.875rem,4.5vw,4rem)]"
            )}
            style={headingStyle}
          >
            {slide.title}
          </h1>
        </div>
      );

    case "content-only":
      return (
        <div className="col-span-12 flex items-center relative py-[8%]">
          {!isMini && (
            <div
              className="absolute top-[4%] left-0 right-0 h-0.5 rounded-full"
              style={{ backgroundColor: colors.accent, opacity: 0.3 }}
            />
          )}
          <div
            className={cn(
              "whitespace-pre-wrap w-full",
              isMini ? "text-[6px]" : "text-[clamp(0.85rem,1.4vw,1.1rem)]"
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
        <div className="col-span-12 flex flex-col py-[5%]">
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
              className="w-12 h-0.5 rounded-full mb-[3%]"
              style={{ backgroundColor: colors.accent, opacity: 0.5 }}
            />
          )}
          <div className="grid grid-cols-12 gap-[4%] flex-1">
            <div
              className={cn(
                "col-span-6 whitespace-pre-wrap overflow-hidden",
                isMini ? "text-[5px]" : "text-[clamp(0.75rem,1.2vw,0.95rem)]"
              )}
              style={bodyStyle}
            >
              {leftContent}
            </div>
            <div className="col-span-6 whitespace-pre-wrap overflow-hidden" style={bodyStyle}>
              {rightContent ? (
                <div
                  className={cn(
                    isMini ? "text-[5px]" : "text-[clamp(0.75rem,1.2vw,0.95rem)]"
                  )}
                  style={bodyStyle}
                >
                  {rightContent}
                </div>
              ) : (
                <div
                  className="h-full rounded border border-dashed flex items-center justify-center"
                  style={{ borderColor: colors.border, color: colors.secondary }}
                >
                  <span className={isMini ? "text-[5px]" : "text-sm"}>Colonne droite</span>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    case "image-left":
      return (
        <div className="col-span-12 grid grid-cols-12 gap-0 h-full">
          <div
            className="col-span-5 flex items-center justify-center relative"
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
          <div className="col-span-7 flex flex-col justify-center px-[6%] py-[5%]">
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
                "whitespace-pre-wrap",
                isMini ? "text-[5px]" : "text-[clamp(0.75rem,1.1vw,0.9rem)]"
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
        <div className="col-span-12 grid grid-cols-12 gap-0 h-full">
          <div className="col-span-7 flex flex-col justify-center px-[6%] py-[5%]">
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
                "whitespace-pre-wrap",
                isMini ? "text-[5px]" : "text-[clamp(0.75rem,1.1vw,0.9rem)]"
              )}
              style={bodyStyle}
            >
              {slide.content}
            </div>
          </div>
          <div
            className="col-span-5 flex items-center justify-center relative"
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
        <div className="col-span-12 flex flex-col py-[5%]">
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
        <div className="col-span-12 flex flex-col py-[4%]">
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
        <div className="col-span-12 flex flex-col py-[4%]">
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
        <div className="col-span-12 flex flex-col py-[4%]">
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

    case "roadmap": {
      const stages = parseRoadmapContent(slide.content);
      return (
        <div className="col-span-12 flex flex-col py-[5%]">
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
          <div className="flex-1 flex items-center justify-between gap-[2%] overflow-hidden px-[2%]">
            {stages.map((stage, i) => (
              <div key={i} className="flex-1 flex flex-col items-center relative">
                {/* Connector line */}
                {i < stages.length - 1 && !isMini && (
                  <div
                    className="absolute top-3 left-[60%] w-[80%] h-0.5"
                    style={{ backgroundColor: colors.border }}
                  />
                )}
                {/* Stage circle */}
                <div
                  className={cn(
                    "rounded-full flex items-center justify-center font-bold z-10",
                    isMini ? "w-4 h-4 text-[4px]" : "w-8 h-8 text-xs"
                  )}
                  style={{
                    backgroundColor: colors.accent,
                    color: colors.background,
                  }}
                >
                  {i + 1}
                </div>
                <span
                  className={cn(
                    "mt-2 text-center font-medium",
                    isMini ? "text-[4px] max-w-[40px]" : "text-xs max-w-[100px]"
                  )}
                  style={headingStyle}
                >
                  {stage}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "architecture": {
      const layers = parseArchitectureContent(slide.content);
      return (
        <div className="col-span-12 flex flex-col py-[5%]">
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
          <div className="flex-1 flex flex-col gap-[3%] overflow-hidden justify-center">
            {layers.map((layer, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg px-[3%] py-[2%] flex items-center justify-between",
                  isMini ? "text-[5px]" : "text-sm"
                )}
                style={{
                  backgroundColor: colors.muted,
                  border: `1px solid ${colors.border}`,
                  color: colors.foreground,
                }}
              >
                <span className="font-semibold" style={headingStyle}>
                  {layer.name}
                </span>
                {layer.items.length > 0 && (
                  <div className="flex gap-[2%]">
                    {layer.items.map((item, j) => (
                      <span
                        key={j}
                        className={cn(
                          "px-2 py-0.5 rounded",
                          isMini ? "text-[4px]" : "text-xs"
                        )}
                        style={{
                          backgroundColor: colors.accent,
                          color: colors.background,
                        }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "comparison": {
      const rows = parseComparisonContent(slide.content);
      return (
        <div className="col-span-12 flex flex-col py-[5%]">
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
              className="w-12 h-0.5 rounded-full mb-[3%]"
              style={{ backgroundColor: colors.accent, opacity: 0.5 }}
            />
          )}
          <div
            className="flex-1 overflow-auto rounded-lg border"
            style={{ borderColor: colors.border }}
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ backgroundColor: colors.muted }}>
                  {rows[0]?.map((cell, j) => (
                    <th
                      key={j}
                      className={cn(
                        "px-[3%] py-[1.5%] font-semibold border-b",
                        isMini ? "text-[5px]" : "text-sm"
                      )}
                      style={{
                        borderColor: colors.border,
                        color: colors.foreground,
                        fontFamily: fonts.heading,
                      }}
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1).map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      backgroundColor: i % 2 === 0 ? colors.background : colors.muted,
                    }}
                  >
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={cn(
                          "px-[3%] py-[1.5%] border-b",
                          isMini ? "text-[5px]" : "text-xs"
                        )}
                        style={{
                          borderColor: colors.border,
                          color: colors.foreground,
                          fontFamily: fonts.body,
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    case "title-content":
    default:
      return (
        <div className="col-span-12 flex flex-col py-[5%]">
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
              "flex-1 whitespace-pre-wrap overflow-hidden",
              isMini ? "text-[5px]" : "text-[clamp(0.8rem,1.3vw,1rem)]"
            )}
            style={bodyStyle}
          >
            {slide.content}
          </div>
        </div>
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Content parsers for new layouts                                   */
/* ------------------------------------------------------------------ */

function parseRoadmapContent(content: string): string[] {
  if (!content.trim()) return ["Phase 1", "Phase 2", "Phase 3", "Phase 4"];
  return content
    .split(/\n|->|→/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface ArchLayer {
  name: string;
  items: string[];
}

function parseArchitectureContent(content: string): ArchLayer[] {
  if (!content.trim()) {
    return [
      { name: "Présentation", items: ["UI", "CLI"] },
      { name: "Application", items: ["API", "Services"] },
      { name: "Données", items: ["DB", "Cache"] },
    ];
  }
  const lines = content.split("\n").filter(Boolean);
  return lines.map((line) => {
    const [name, rest] = line.split(":");
    return {
      name: name.trim(),
      items: rest ? rest.split(",").map((s) => s.trim()).filter(Boolean) : [],
    };
  });
}

function parseComparisonContent(content: string): string[][] {
  if (!content.trim()) {
    return [
      ["Critère", "Option A", "Option B"],
      ["Coût", "Bas", "Élevé"],
      ["Performance", "Moyenne", "Haute"],
      ["Complexité", "Faible", "Haute"],
    ];
  }
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("|").map((cell) => cell.trim()));
}

/**
 * Mini thumbnail render for use in thumbnail grids.
 */
export function MiniSlideRenderer({
  slide,
  template,
}: {
  slide: Slide;
  template: Template;
}) {
  return (
    <SlideRenderer
      slide={slide}
      template={template}
      scale={0.15}
      mode="preview"
      className="rounded"
    />
  );
}
