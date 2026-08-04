"use client";

import { GanttTask, TimeScale } from "../types/presentation";
import { TemplateColor, TemplateFont } from "../types/template";
import {
  getDateRange,
  getTaskPosition,
  generateScaleMarkers,
  resolveTimeScale,
} from "@/lib/ganttParser";

export interface GanttEngineProps {
  tasks: GanttTask[];
  colors: TemplateColor;
  fonts: TemplateFont;
  scale: number;
  viewMode?: TimeScale | "auto";
}

export function GanttEngine({
  tasks,
  colors,
  fonts,
  scale,
  viewMode = "auto",
}: GanttEngineProps) {
  const { min, max } = getDateRange(tasks);
  const effectiveScale: TimeScale = resolveTimeScale(min, max, viewMode);
  const markers = generateScaleMarkers(min, max, effectiveScale);

  const isMini = scale < 0.5;

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{
        fontFamily: fonts.body,
        color: colors.foreground,
        backgroundColor: colors.background,
      }}
    >
      {/* Scale header */}
      <div
        className="relative w-full flex-shrink-0 border-b"
        style={{
          height: isMini ? 16 : 28,
          borderColor: colors.border,
          backgroundColor: colors.muted,
        }}
      >
        {markers.map((m, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 flex flex-col justify-end pb-1"
            style={{
              left: `${m.position * 100}%`,
            }}
          >
            <span
              className="text-[9px] whitespace-nowrap"
              style={{
                color: m.isMajor ? colors.foreground : colors.secondary,
                fontWeight: m.isMajor ? 600 : 400,
              }}
            >
              {m.label}
            </span>
            {m.isMajor && (
              <div
                className="absolute top-0 bottom-0 w-px"
                style={{
                  backgroundColor: colors.border,
                  opacity: 0.5,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Task rows */}
      <div className="flex-1 overflow-auto">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm opacity-50">
            Aucune tâche à afficher
          </div>
        ) : (
          <div className="flex flex-col">
            {tasks.map((task, i) => {
              const pos = getTaskPosition(task, min, max);
              const barColor = task.color || colors.accent;
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-2 w-full"
                  style={{
                    minHeight: isMini ? 20 : 36,
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  {/* Task name */}
                  <div
                    className="flex-shrink-0 px-2 truncate"
                    style={{
                      width: isMini ? "30%" : "25%",
                      fontSize: isMini ? 8 : 12,
                      fontFamily: fonts.body,
                    }}
                    title={task.name}
                  >
                    {task.name}
                  </div>

                  {/* Bar area */}
                  <div className="flex-1 relative h-full" style={{ minHeight: isMini ? 20 : 36 }}>
                    {/* Grid lines */}
                    {!isMini && markers.length > 0 && (
                      <div className="absolute inset-0 pointer-events-none">
                        {markers
                          .filter((m) => m.isMajor)
                          .map((m, idx) => (
                            <div
                              key={idx}
                              className="absolute top-0 bottom-0 w-px"
                              style={{
                                left: `${m.position * 100}%`,
                                backgroundColor: colors.border,
                                opacity: 0.3,
                              }}
                            />
                          ))}
                      </div>
                    )}

                    {/* Task bar */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 rounded-full flex items-center overflow-hidden"
                      style={{
                        left: `${pos.left}%`,
                        width: `${Math.max(pos.width, 0.5)}%`,
                        height: isMini ? 6 : 14,
                        backgroundColor: barColor,
                        minWidth: 4,
                      }}
                    >
                      {/* Progress overlay */}
                      {typeof task.progress === "number" && task.progress > 0 && (
                        <div
                          className="h-full"
                          style={{
                            width: `${task.progress}%`,
                            backgroundColor: "rgba(255,255,255,0.35)",
                          }}
                        />
                      )}
                    </div>

                    {/* Progress label */}
                    {!isMini && typeof task.progress === "number" && (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 text-[9px] font-medium px-1 pointer-events-none"
                        style={{
                          left: `${pos.left + pos.width}%`,
                          color: colors.secondary,
                          marginLeft: 4,
                        }}
                      >
                        {task.progress}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
