"use client";

import { CSSProperties } from "react";
import { TimelineEvent, TimeScale } from "../types/presentation";
import { TemplateColor, TemplateFont } from "../types/template";
import {
  getTimelineDateRange,
  getEventPosition,
  generateScaleMarkers,
  resolveTimeScale,
} from "@/lib/ganttParser";

/** Horizontal inset of the axis on both sides, so dots and labels are never clipped. */
const EDGE_PERCENT = 4;
const AXIS_SPAN = 100 - EDGE_PERCENT * 2;
/** Distance between the axis and the label block. */
const CONNECTOR_HEIGHT = 14;
const LABEL_WIDTH = 140;

/**
 * Map a fraction of the date range (0–1) onto the inset axis span (4%–96%).
 * Scale markers, the axis and the event dots all go through this, so they line up.
 */
function insetPercent(fraction: number): number {
  // Scale markers can point just outside the range (e.g. the quarter a month belongs
  // to starts before the first event): keep them on the axis instead of past its ends.
  const clamped = Math.min(1, Math.max(0, fraction));
  return EDGE_PERCENT + clamped * AXIS_SPAN;
}

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
  const effectiveScale: TimeScale = resolveTimeScale(min, max, viewMode);
  const markers = generateScaleMarkers(min, max, effectiveScale);

  const isMini = scale < 0.5;
  const dotSize = isMini ? 8 : 14;
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const firstPercent = sortedEvents.length
    ? insetPercent(getEventPosition(sortedEvents[0], min, max) / 100)
    : 0;
  const lastPercent = sortedEvents.length
    ? insetPercent(getEventPosition(sortedEvents[sortedEvents.length - 1], min, max) / 100)
    : 0;

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{
        fontFamily: fonts.body,
        color: colors.foreground,
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
        {markers.map((m, i) => {
          const left = insetPercent(m.position);
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 flex flex-col justify-end pb-1"
              style={{ left: `${left}%`, transform: "translateX(-50%)" }}
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
          );
        })}
      </div>

      {/* Timeline body */}
      <div className="flex-1 relative overflow-auto">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm opacity-50">
            Aucun événement à afficher
          </div>
        ) : (
          <div className="relative h-full min-h-[120px]">
            {/* Central axis — same inset as the markers and the events */}
            <div
              className="absolute h-0.5 rounded-full"
              style={{
                left: `${EDGE_PERCENT}%`,
                right: `${EDGE_PERCENT}%`,
                top: "50%",
                transform: "translateY(-50%)",
                backgroundColor: colors.border,
              }}
            />

            {/* Ticks, one per scale marker, so header labels line up with the axis */}
            {markers.map((m, i) => (
              <div
                key={i}
                className="absolute"
                style={{
                  left: `${insetPercent(m.position)}%`,
                  top: "50%",
                  width: 1,
                  height: m.isMajor ? 8 : 4,
                  transform: "translate(-50%, -50%)",
                  backgroundColor: colors.border,
                }}
              />
            ))}

            {/* Active segment */}
            {sortedEvents.length > 1 && (
              <div
                className="absolute h-0.5 rounded-full"
                style={{
                  top: "50%",
                  transform: "translateY(-50%)",
                  left: `${firstPercent}%`,
                  width: `${Math.max(0, lastPercent - firstPercent)}%`,
                  backgroundColor: colors.accent,
                }}
              />
            )}

            {/* Events */}
            <div className="absolute inset-0">
              {sortedEvents.map((event, i) => {
                const center = insetPercent(getEventPosition(event, min, max) / 100);
                const eventColor = event.color || colors.accent;
                const isAbove = i % 2 === 0;
                const labelSide: CSSProperties = isAbove ? { bottom: 0 } : { top: 0 };

                return (
                  <div
                    key={event.id}
                    className="absolute"
                    style={{
                      left: `${center}%`,
                      top: "50%",
                      width: 0,
                      height: 0,
                    }}
                  >
                    {/* Dot — anchored exactly on the axis, whatever the label height */}
                    <div
                      className="absolute rounded-full"
                      style={{
                        left: 0,
                        top: 0,
                        transform: "translate(-50%, -50%)",
                        width: dotSize,
                        height: dotSize,
                        backgroundColor: eventColor,
                        border: `2px solid ${colors.background}`,
                        boxShadow: `0 0 0 1px ${colors.border}`,
                      }}
                    />

                    {/* Label block — stacked away from the axis, never over it */}
                    {!isMini && (
                      <div
                        className="absolute flex flex-col items-center px-1"
                        style={{
                          ...labelSide,
                          left: 0,
                          width: LABEL_WIDTH,
                          transform: "translateX(-50%)",
                        }}
                      >
                        {!isAbove && (
                          <div
                            className="w-px flex-shrink-0"
                            style={{
                              height: CONNECTOR_HEIGHT,
                              backgroundColor: colors.border,
                            }}
                          />
                        )}
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
                        {isAbove && (
                          <div
                            className="w-px flex-shrink-0"
                            style={{
                              height: CONNECTOR_HEIGHT,
                              backgroundColor: colors.border,
                            }}
                          />
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
