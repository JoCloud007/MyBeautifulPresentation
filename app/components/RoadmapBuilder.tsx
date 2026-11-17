"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  RoadmapItem,
  RoadmapLane,
  Phase,
  parseRoadmapContent,
  formatRoadmapItems,
  getRoadmapDateRange,
  getRoadmapItemPosition,
  generateScaleMarkers,
  resolveTimeScale,
} from "@/lib/ganttParser";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import { usePresentationStore } from "../stores/presentationStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, RotateCcw, Save, Undo } from "lucide-react";
import { GanttEngine } from "./GanttEngine";
import { TimelineEngine } from "./TimelineEngine";
import { GanttTask, TimelineEvent, TimeScale } from "../types/presentation";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${day}`;
}

const PHASES: Phase[] = ["Q1", "Q2", "Q3", "Q4"];
const STATUSES: Array<NonNullable<RoadmapItem["status"]>> = [
  "planned",
  "in-progress",
  "completed",
  "delayed",
];

const VIEW_MODES: { value: TimeScale | "auto"; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "days", label: "Jours" },
  { value: "weeks", label: "Semaines" },
  { value: "months", label: "Mois" },
  { value: "quarters", label: "Trimestres" },
  { value: "years", label: "Années" },
];

export function RoadmapBuilder() {
  const [view, setView] = useState<"roadmap" | "gantt" | "timeline">("roadmap");
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [lanes, setLanes] = useState<RoadmapLane[]>([]);
  const [viewMode, setViewMode] = useState<TimeScale | "auto">("auto");

  const template = useTemplateStore(getActiveTemplate);
  const addSlide = usePresentationStore((s) => s.addSlide);
  const updateSlide = usePresentationStore((s) => s.updateSlide);
  const presentation = usePresentationStore((s) => s.presentation);
  const currentSlideIndex = usePresentationStore((s) => s.currentSlideIndex);
  const currentSlide = presentation?.slides[currentSlideIndex];

  const historyRef = useRef<{ items: RoadmapItem[]; lanes: RoadmapLane[] }[]>(
    []
  );
  const stateRef = useRef({ items, lanes });
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    stateRef.current = { items, lanes };
  }, [items, lanes]);

  const saveHistory = useCallback(() => {
    historyRef.current.push({
      items: [...stateRef.current.items],
      lanes: [...stateRef.current.lanes],
    });
    if (historyRef.current.length > 20) historyRef.current.shift();
    setCanUndo(true);
  }, []);

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (prev) {
      setItems(prev.items);
      setLanes(prev.lanes);
    }
    setCanUndo(historyRef.current.length > 0);
  }, []);

  const colors = template.colors;
  const fonts = template.fonts;

  // Load from current slide
  useEffect(() => {
    if (!currentSlide) return;
    if (currentSlide.layout === "roadmap") {
      const parsed = parseRoadmapContent(currentSlide.content || "");
      if (parsed.items.length > 0) {
        setItems(parsed.items);
        setLanes(parsed.lanes);
      } else {
        const defaultLane: RoadmapLane = {
          id: generateUUID(),
          name: "Équipe A",
        };
        setLanes([defaultLane]);
        setItems([
          {
            id: generateUUID(),
            name: "Lancement",
            startDate: todayISO(),
            endDate: addDaysISO(todayISO(), 30),
            laneId: defaultLane.id,
            phase: "Q1",
            status: "planned",
          },
        ]);
      }
    }
  }, [currentSlide?.id]);

  // Live sync to slide
  useEffect(() => {
    if (!currentSlide || currentSlide.layout !== "roadmap") return;
    const timer = setTimeout(() => {
      const content = formatRoadmapItems(items, lanes);
      updateSlide(currentSlideIndex, {
        ...currentSlide,
        layout: "roadmap",
        title: currentSlide.title || "Roadmap",
        content,
        data: { roadmap: { items: [...items], lanes: [...lanes] } } as any,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [items, lanes, currentSlide, currentSlideIndex, updateSlide]);

  // ─── Lane actions ──────────────────────────────────────────────────────────

  const addLane = useCallback(() => {
    saveHistory();
    const newLane: RoadmapLane = {
      id: generateUUID(),
      name: `Équipe ${String.fromCharCode(65 + lanes.length)}`,
      color: colors.accent,
    };
    setLanes((prev) => [...prev, newLane]);
  }, [lanes.length, colors.accent, saveHistory]);

  const updateLane = useCallback(
    (id: string, updates: Partial<RoadmapLane>) => {
      saveHistory();
      setLanes((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
    },
    [saveHistory]
  );

  const deleteLane = useCallback(
    (id: string) => {
      saveHistory();
      setLanes((prev) => prev.filter((l) => l.id !== id));
      setItems((prev) => prev.filter((i) => i.laneId !== id));
    },
    [saveHistory]
  );

  // ─── Item actions ──────────────────────────────────────────────────────────

  const addItem = useCallback(() => {
    saveHistory();
    const laneId = lanes[0]?.id || "";
    const newItem: RoadmapItem = {
      id: generateUUID(),
      name: `Étape ${items.length + 1}`,
      startDate: todayISO(),
      endDate: addDaysISO(todayISO(), 30),
      laneId,
      phase: "Q1",
      color: colors.accent,
      progress: 0,
      status: "planned",
    };
    setItems((prev) => [...prev, newItem]);
  }, [items.length, lanes, colors.accent, saveHistory]);

  const updateItem = useCallback(
    (id: string, updates: Partial<RoadmapItem>) => {
      saveHistory();
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
    },
    [saveHistory]
  );

  const deleteItem = useCallback(
    (id: string) => {
      saveHistory();
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    [saveHistory]
  );

  // ─── Helpers for preview ───────────────────────────────────────────────────

  const ganttTasks: GanttTask[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    startDate: item.startDate,
    endDate: item.endDate,
    color: item.color || colors.accent,
    progress: item.progress,
  }));

  const timelineEvents: TimelineEvent[] = items.map((item) => ({
    id: item.id,
    date: item.startDate,
    title: item.name,
    description: item.phase,
    color: item.color || colors.accent,
  }));

  const laneMap = new Map(lanes.map((l) => [l.id, l]));

  const handleReset = useCallback(() => {
    saveHistory();
    setItems([]);
    setLanes([]);
  }, [saveHistory]);

  const handleInsert = useCallback(() => {
    const content = formatRoadmapItems(items, lanes);
    const slideData = {
      layout: "roadmap" as const,
      title: currentSlide?.title || "Roadmap",
      content,
      data: { roadmap: { items: [...items], lanes: [...lanes] } } as any,
    };
    if (currentSlide) {
      updateSlide(currentSlideIndex, slideData);
    } else {
      addSlide(slideData);
    }
  }, [items, lanes, currentSlide, currentSlideIndex, updateSlide, addSlide]);

  const canInsert = items.length > 0;

  return (
    <div className="flex flex-col h-full bg-transparent text-foreground">
      <div className="flex flex-1 overflow-hidden">
        {/* Editor sidebar */}
        <div className="flex flex-col h-full overflow-hidden flex-1">
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b gap-2 flex-shrink-0"
            style={{ borderColor: colors.border }}
          >
            <div className="flex items-center gap-1">
              <Button
                size="xs"
                variant={view === "roadmap" ? "default" : "outline"}
                onClick={() => setView("roadmap")}
              >
                Roadmap
              </Button>
              <Button
                size="xs"
                variant={view === "gantt" ? "default" : "outline"}
                onClick={() => setView("gantt")}
              >
                GANTT
              </Button>
              <Button
                size="xs"
                variant={view === "timeline" ? "default" : "outline"}
                onClick={() => setView("timeline")}
              >
                Timeline
              </Button>
            </div>
            <Select
              value={viewMode}
              onValueChange={(v) => setViewMode(v as TimeScale | "auto")}
            >
              <SelectTrigger size="sm" className="w-auto min-w-[100px]">
                <SelectValue placeholder="Vue" />
              </SelectTrigger>
              <SelectContent>
                {VIEW_MODES.map((vm) => (
                  <SelectItem key={vm.value} value={vm.value}>
                    {vm.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              {/* Lanes */}
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
                  Swimlanes (Équipes)
                </Label>
                {lanes.length === 0 && (
                  <div className="text-sm text-white/40 text-center py-2">
                    Aucune équipe. Ajoutez-en une.
                  </div>
                )}
                {lanes.map((lane) => (
                  <div
                    key={lane.id}
                    className="rounded-lg border p-2 flex items-center gap-2"
                    style={{ borderColor: colors.border }}
                  >
                    <input
                      type="color"
                      value={lane.color || colors.accent}
                      onChange={(e) =>
                        updateLane(lane.id, { color: e.target.value })
                      }
                      className="w-5 h-5 rounded cursor-pointer border-0 p-0 shrink-0"
                      style={{ background: "transparent" }}
                    />
                    <Input
                      value={lane.name}
                      onChange={(e) =>
                        updateLane(lane.id, { name: e.target.value })
                      }
                      placeholder="Nom de l'équipe"
                      className="flex-1 text-sm h-7"
                    />
                    <Button
                      size="icon-xs"
                      variant="destructive"
                      onClick={() => deleteLane(lane.id)}
                      title="Supprimer"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={addLane}
                >
                  <Plus className="size-3.5 mr-1" />
                  Ajouter une équipe
                </Button>
              </div>

              {/* Items */}
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
                  Éléments Roadmap
                </Label>
                {items.length === 0 && (
                  <div className="text-sm text-white/40 text-center py-2">
                    Aucun élément. Ajoutez-en un.
                  </div>
                )}
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border p-2.5 space-y-2"
                    style={{ borderColor: colors.border }}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={item.name}
                        onChange={(e) =>
                          updateItem(item.id, { name: e.target.value })
                        }
                        placeholder="Nom"
                        className="flex-1 text-sm"
                      />
                      <Button
                        size="icon-xs"
                        variant="destructive"
                        onClick={() => deleteItem(item.id)}
                        title="Supprimer"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Début</Label>
                        <Input
                          type="date"
                          value={item.startDate}
                          onChange={(e) =>
                            updateItem(item.id, { startDate: e.target.value })
                          }
                          className="text-xs h-7"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Fin</Label>
                        <Input
                          type="date"
                          value={item.endDate}
                          onChange={(e) =>
                            updateItem(item.id, { endDate: e.target.value })
                          }
                          className="text-xs h-7"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Équipe</Label>
                        <Select
                          value={item.laneId}
                          onValueChange={(v) =>
                            updateItem(item.id, { laneId: v ?? undefined })
                          }
                        >
                          <SelectTrigger className="text-xs h-7">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {lanes.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Phase</Label>
                        <Select
                          value={item.phase}
                          onValueChange={(v) =>
                            updateItem(item.id, { phase: v as Phase })
                          }
                        >
                          <SelectTrigger className="text-xs h-7">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PHASES.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Statut</Label>
                        <Select
                          value={item.status || "planned"}
                          onValueChange={(v) =>
                            updateItem(item.id, {
                              status: v as RoadmapItem["status"],
                            })
                          }
                        >
                          <SelectTrigger className="text-xs h-7">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s === "planned"
                                  ? "Planifié"
                                  : s === "in-progress"
                                  ? "En cours"
                                  : s === "completed"
                                  ? "Terminé"
                                  : "Retardé"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Couleur</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={item.color || colors.accent}
                            onChange={(e) =>
                              updateItem(item.id, { color: e.target.value })
                            }
                            className="w-5 h-5 rounded cursor-pointer border-0 p-0"
                            style={{ background: "transparent" }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="space-y-1 flex-1">
                        <Label className="text-[10px]">Progression</Label>
                        <Slider
                          value={[item.progress ?? 0]}
                          onValueChange={(val) => {
                            const v = Array.isArray(val) ? val[0] : val;
                            updateItem(item.id, { progress: v });
                          }}
                          min={0}
                          max={100}
                          step={5}
                        />
                      </div>
                      <span className="text-xs tabular-nums w-8 text-right">
                        {item.progress ?? 0}%
                      </span>
                    </div>
                  </div>
                ))}

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={addItem}
                >
                  <Plus className="size-3.5 mr-1" />
                  Ajouter un élément
                </Button>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Preview panel */}
        <div
          className="w-[55%] border-l overflow-hidden flex flex-col"
          style={{ borderColor: colors.border }}
        >
          <div
            className="px-3 py-2 border-b text-xs font-semibold uppercase tracking-wider shrink-0"
            style={{ borderColor: colors.border }}
          >
            Aperçu —{" "}
            {view === "roadmap" ? "Roadmap" : view === "gantt" ? "GANTT" : "Timeline"}
          </div>
          <div className="flex-1 overflow-hidden">
            {view === "gantt" && (
              <GanttEngine
                tasks={ganttTasks}
                colors={colors}
                fonts={fonts}
                scale={1}
                viewMode={viewMode}
              />
            )}
            {view === "timeline" && (
              <TimelineEngine
                events={timelineEvents}
                colors={colors}
                fonts={fonts}
                scale={1}
                viewMode={viewMode}
              />
            )}
            {view === "roadmap" && (
              <RoadmapPreview
                items={items}
                lanes={lanes}
                colors={colors}
                fonts={fonts}
              />
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-t flex-shrink-0"
        style={{ borderColor: colors.border }}
      >
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleUndo}
            disabled={!canUndo}
          >
            <Undo className="size-3.5 mr-1" />
            Annuler
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            disabled={items.length === 0 && lanes.length === 0}
          >
            <RotateCcw className="size-3.5 mr-1" />
            Réinitialiser
          </Button>
        </div>

        <Button size="sm" onClick={handleInsert} disabled={!canInsert}>
          <Save className="size-3.5 mr-1" />
          {currentSlide ? "Modifier la slide" : "Insérer dans la présentation"}
        </Button>
      </div>
    </div>
  );
}

/* ─── Roadmap Preview (swimlanes + phases) ─────────────────────────────────── */

function RoadmapPreview({
  items,
  lanes,
  colors,
  fonts,
}: {
  items: RoadmapItem[];
  lanes: RoadmapLane[];
  colors: { background: string; foreground: string; accent: string; border: string; muted: string; secondary: string };
  fonts: { body: string };
}) {
  const laneMap = new Map(lanes.map((l) => [l.id, l]));
  const { min, max } = getRoadmapDateRange(items);
  const scale: TimeScale = resolveTimeScale(min, max, "auto");
  const markers = generateScaleMarkers(min, max, scale);

  if (items.length === 0 || lanes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm opacity-50">
        Aucune donnée à afficher
      </div>
    );
  }

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
          height: 28,
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

      {/* Swimlane rows */}
      <div className="flex-1 overflow-auto">
        {lanes.map((lane) => {
          const laneItems = items.filter((i) => i.laneId === lane.id);
          return (
            <div
              key={lane.id}
              className="flex items-stretch border-b"
              style={{ borderColor: colors.border, minHeight: 64 }}
            >
              {/* Lane label */}
              <div
                className="flex-shrink-0 px-3 py-2 flex flex-col justify-center border-r"
                style={{
                  width: 120,
                  borderColor: colors.border,
                  backgroundColor: colors.muted,
                }}
              >
                <span className="text-[11px] font-semibold truncate" title={lane.name}>
                  {lane.name}
                </span>
                <span className="text-[9px] opacity-60">
                  {laneItems.length} élément{laneItems.length > 1 ? "s" : ""}
                </span>
              </div>

              {/* Lane timeline */}
              <div className="flex-1 relative py-2">
                {/* Grid lines */}
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

                {/* Items */}
                {laneItems.map((item) => {
                  const pos = getRoadmapItemPosition(item, min, max);
                  const phaseColors: Record<Phase, string> = {
                    Q1: "#3b82f6",
                    Q2: "#22c55e",
                    Q3: "#f59e0b",
                    Q4: "#ef4444",
                  };
                  const barColor = item.color || phaseColors[item.phase] || colors.accent;
                  const statusEmoji =
                    item.status === "completed"
                      ? "✓"
                      : item.status === "in-progress"
                      ? "▶"
                      : item.status === "delayed"
                      ? "⚠"
                      : "○";

                  return (
                    <div
                      key={item.id}
                      className="absolute flex items-center gap-1 rounded px-1.5 py-0.5"
                      style={{
                        left: `${pos.left}%`,
                        width: `${Math.max(pos.width, 1)}%`,
                        minWidth: 4,
                        top: 4,
                        height: 22,
                        backgroundColor: barColor + "30",
                        border: `1px solid ${barColor}`,
                      }}
                      title={`${item.name} (${item.phase})`}
                    >
                      <span className="text-[9px] truncate w-full" style={{ color: barColor }}>
                        {statusEmoji} {item.name}
                      </span>
                      {typeof item.progress === "number" && item.progress > 0 && (
                        <div
                          className="absolute bottom-0 left-0 h-0.5"
                          style={{
                            width: `${item.progress}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Phase legend */}
      <div
        className="flex-shrink-0 px-3 py-1.5 border-t flex items-center gap-3"
        style={{ borderColor: colors.border }}
      >
        <span className="text-[9px] opacity-60">Phases :</span>
        {PHASES.map((p) => (
          <div key={p} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  p === "Q1"
                    ? "#3b82f6"
                    : p === "Q2"
                    ? "#22c55e"
                    : p === "Q3"
                    ? "#f59e0b"
                    : "#ef4444",
              }}
            />
            <span className="text-[9px]">{p}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
