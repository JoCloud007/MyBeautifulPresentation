"use client";

import { TimelineEvent, TimeScale } from "../types/presentation";
import { TemplateColor, TemplateFont } from "../types/template";
import {
  getTimelineDateRange,
  getEventPosition,
  generateScaleMarkers,
  detectTimeScale,
} from "@/lib/ganttParser";

export interface TimelineEngineProps {
  events: TimelineEvent[];
  colors: TemplateColor;
  fonts: TemplateFont;
  scale: number;
  viewMode?: TimeScale | "auto";
}

export function TimelineEngine({
  events,
  colors,
  fonts,
  scale,
  viewMode = "auto",
}: TimelineEngineProps) {
  const { min, max } = getTimelineDateRange(events);
  const effectiveScale: TimeScale =
    viewMode === "auto" ? detectTimeScale(min, max) : viewMode;
  const markers = generateScaleMarkers(min, max, effectiveScale);

  const isMini = scale < 0.5;
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

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
            style={{ left: `${m.position * 100}%` }}
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
          </div>
        ))}
      </div>

      {/* Timeline body */}
      <div className="flex-1 relative overflow-auto">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm opacity-50">
            Aucun événement à afficher
          </div>
        ) : (
          <div className="relative h-full min-h-[120px]">
            {/* Central axis */}
            <div
              className="absolute left-[4%] right-[4%] h-0.5 rounded-full"
              style={{
                top: "50%",
                transform: "translateY(-50%)",
                backgroundColor: colors.border,
              }}
            />

            {/* Active segment */}
            {sortedEvents.length > 1 && (
              <div
                className="absolute h-0.5 rounded-full"
                style={{
                  top: "50%",
                  transform: "translateY(-50%)",
                  left: `${getEventPosition(sortedEvents[0], min, max)}%`,
                  width: `${Math.max(
                    0,
                    getEventPosition(sortedEvents[sortedEvents.length - 1], min, max) -
                      getEventPosition(sortedEvents[0], min, max)
                  )}%`,
                  backgroundColor: colors.accent,
                }}
              />
            )}

            {/* Events */}
            <div className="absolute inset-0">
              {sortedEvents.map((event, i) => {
                const pos = getEventPosition(event, min, max);
                const eventColor = event.color || colors.accent;
                const isAbove = i % 2 === 0;

                return (
                  <div
                    key={event.id}
                    className="absolute flex flex-col items-center"
                    style={{
                      left: `${pos}%`,
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      width: isMini ? 60 : 140,
                    }}
                  >
                    {isAbove && !isMini && (
                      <div className="flex flex-col items-center mb-1.5">
                        <span
                          className="text-[10px] font-semibold leading-tight text-center"
                          style={{ color: eventColor }}
                        >
                          {new Date(event.date + "T00:00:00").toLocaleDateString("fr-FR")}
                        </span>
                        <span
                          className="text-[9px] leading-tight text-center mt-0.5"
                          style={{ color: colors.secondary }}
                        >
                          {event.title}
                        </span>
                        {event.description && (
                          <span
                            className="text-[8px] leading-tight text-center mt-0.5 line-clamp-2"
                            style={{ color: colors.muted }}
                          >
                            {event.description}
                          </span>
                        )}
                        <div
                          className="w-px h-3 mt-1"
                          style={{ backgroundColor: colors.border }}
                        />
                      </div>
                    )}

                    {/* Dot */}
                    <div
                      className="rounded-full flex-shrink-0"
                      style={{
                        width: isMini ? 8 : 14,
                        height: isMini ? 8 : 14,
                        backgroundColor: eventColor,
                        border: `2px solid ${colors.background}`,
                        boxShadow: `0 0 0 1px ${colors.border}`,
                      }}
                    />

                    {!isAbove && !isMini && (
                      <div className="flex flex-col items-center mt-1.5">
                        <div
                          className="w-px h-3 mb-1"
                          style={{ backgroundColor: colors.border }}
                        />
                        <span
                          className="text-[10px] font-semibold leading-tight text-center"
                          style={{ color: eventColor }}
                        >
                          {new Date(event.date + "T00:00:00").toLocaleDateString("fr-FR")}
                        </span>
                        <span
                          className="text-[9px] leading-tight text-center mt-0.5"
                          style={{ color: colors.secondary }}
                        >
                          {event.title}
                        </span>
                        {event.description && (
                          <span
                            className="text-[8px] leading-tight text-center mt-0.5 line-clamp-2"
                            style={{ color: colors.muted }}
                          >
                            {event.description}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
