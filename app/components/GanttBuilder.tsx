"use client";

import { useState, useCallback } from "react";
import { GanttTask, TimelineEvent, TimeScale } from "../types/presentation";
import { useTemplateStore, getActiveTemplate } from "../stores/templateStore";
import { usePresentationStore } from "../stores/presentationStore";
import { GanttEngine } from "./GanttEngine";
import { TimelineEngine } from "./TimelineEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, RotateCcw, Save } from "lucide-react";

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

const VIEW_MODES: { value: TimeScale | "auto"; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "days", label: "Jours" },
  { value: "weeks", label: "Semaines" },
  { value: "months", label: "Mois" },
  { value: "quarters", label: "Trimestres" },
  { value: "years", label: "Années" },
];

export function GanttBuilder() {
  const [mode, setMode] = useState<"gantt" | "timeline">("gantt");
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [viewMode, setViewMode] = useState<TimeScale | "auto">("auto");

  const template = useTemplateStore(getActiveTemplate);
  const addSlide = usePresentationStore((s) => s.addSlide);

  const colors = template.colors;
  const fonts = template.fonts;

  // ─── GANTT actions ───────────────────────────────────────────────────────

  const addTask = useCallback(() => {
    const start = todayISO();
    const end = addDaysISO(start, 7);
    const newTask: GanttTask = {
      id: generateUUID(),
      name: `Tâche ${tasks.length + 1}`,
      startDate: start,
      endDate: end,
      color: colors.accent,
      progress: 0,
    };
    setTasks((prev) => [...prev, newTask]);
  }, [tasks.length, colors.accent]);

  const updateTask = useCallback(
    (id: string, updates: Partial<GanttTask>) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
      );
    },
    []
  );

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ─── Timeline actions ────────────────────────────────────────────────────

  const addEvent = useCallback(() => {
    const newEvent: TimelineEvent = {
      id: generateUUID(),
      date: todayISO(),
      title: `Événement ${events.length + 1}`,
      description: "",
      color: colors.accent,
    };
    setEvents((prev) => [...prev, newEvent]);
  }, [events.length, colors.accent]);

  const updateEvent = useCallback(
    (id: string, updates: Partial<TimelineEvent>) => {
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
      );
    },
    []
  );

  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // ─── Global actions ──────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setTasks([]);
    setEvents([]);
  }, []);

  const handleInsert = useCallback(() => {
    if (mode === "gantt") {
      const effectiveView: TimeScale | undefined =
        viewMode === "auto" ? undefined : viewMode;
      const content = tasks
        .map((t) => {
          const parts = [t.name, t.startDate, t.endDate];
          if (t.color) parts.push(t.color);
          return parts.join(" | ");
        })
        .join("\n");
      addSlide({
        layout: "gantt",
        title: "Diagramme de Gantt",
        content,
        data: { gantt: { tasks: [...tasks], viewMode: effectiveView } },
      });
    } else {
      const effectiveView: TimeScale | undefined =
        viewMode === "auto" ? undefined : viewMode;
      const content = events
        .map((e) => {
          let line = `${e.date} - ${e.title}`;
          if (e.description) line += ` - ${e.description}`;
          return line;
        })
        .join("\n");
      addSlide({
        layout: "timeline",
        title: "Timeline",
        content,
        data: { timeline: { events: [...events], viewMode: effectiveView } },
      });
    }
  }, [mode, tasks, events, viewMode, addSlide]);

  const canInsert =
    mode === "gantt" ? tasks.length > 0 : events.length > 0;

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div
          className="flex flex-col h-full border-r overflow-hidden"
          style={{ width: "40%", minWidth: 280 }}
        >
          {/* Header: mode toggle + view selector */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b gap-2 flex-shrink-0"
            style={{ borderColor: colors.border }}
          >
            <div className="flex items-center gap-1">
              <Button
                size="xs"
                variant={mode === "gantt" ? "default" : "outline"}
                onClick={() => setMode("gantt")}
              >
                GANTT
              </Button>
              <Button
                size="xs"
                variant={mode === "timeline" ? "default" : "outline"}
                onClick={() => setMode("timeline")}
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

          {/* Scrollable list */}
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              {mode === "gantt" ? (
                tasks.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Aucune tâche. Cliquez sur "Ajouter" pour commencer.
                  </div>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-lg border p-2.5 space-y-2"
                      style={{ borderColor: colors.border }}
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          value={task.name}
                          onChange={(e) =>
                            updateTask(task.id, { name: e.target.value })
                          }
                          placeholder="Nom de la tâche"
                          className="flex-1 text-sm"
                        />
                        <Button
                          size="icon-xs"
                          variant="destructive"
                          onClick={() => deleteTask(task.id)}
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
                            value={task.startDate}
                            onChange={(e) =>
                              updateTask(task.id, {
                                startDate: e.target.value,
                              })
                            }
                            className="text-xs h-7"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Fin</Label>
                          <Input
                            type="date"
                            value={task.endDate}
                            onChange={(e) =>
                              updateTask(task.id, {
                                endDate: e.target.value,
                              })
                            }
                            className="text-xs h-7"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="space-y-1 flex-1">
                          <Label className="text-[10px]">Progression</Label>
                          <Slider
                            value={[task.progress ?? 0]}
                            onValueChange={(val) => {
                              const v = Array.isArray(val) ? val[0] : val;
                              updateTask(task.id, { progress: v });
                            }}
                            min={0}
                            max={100}
                            step={5}
                          />
                        </div>
                        <span className="text-xs tabular-nums w-8 text-right">
                          {task.progress ?? 0}%
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] shrink-0">Couleur</Label>
                        <input
                          type="color"
                          value={task.color || colors.accent}
                          onChange={(e) =>
                            updateTask(task.id, { color: e.target.value })
                          }
                          className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                          style={{ background: "transparent" }}
                        />
                      </div>
                    </div>
                  ))
                )
              ) : events.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Aucun événement. Cliquez sur "Ajouter" pour commencer.
                </div>
              ) : (
                events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border p-2.5 space-y-2"
                    style={{ borderColor: colors.border }}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={event.title}
                        onChange={(e) =>
                          updateEvent(event.id, { title: e.target.value })
                        }
                        placeholder="Titre"
                        className="flex-1 text-sm"
                      />
                      <Button
                        size="icon-xs"
                        variant="destructive"
                        onClick={() => deleteEvent(event.id)}
                        title="Supprimer"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px]">Date</Label>
                      <Input
                        type="date"
                        value={event.date}
                        onChange={(e) =>
                          updateEvent(event.id, { date: e.target.value })
                        }
                        className="text-xs h-7"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px]">Description</Label>
                      <Textarea
                        value={event.description || ""}
                        onChange={(e) =>
                          updateEvent(event.id, {
                            description: e.target.value,
                          })
                        }
                        placeholder="Description (optionnelle)"
                        className="text-xs min-h-[48px]"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Label className="text-[10px] shrink-0">Couleur</Label>
                      <input
                        type="color"
                        value={event.color || colors.accent}
                        onChange={(e) =>
                          updateEvent(event.id, { color: e.target.value })
                        }
                        className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                        style={{ background: "transparent" }}
                      />
                    </div>
                  </div>
                ))
              )}

              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={mode === "gantt" ? addTask : addEvent}
              >
                <Plus className="size-3.5 mr-1" />
                {mode === "gantt" ? "Ajouter une tâche" : "Ajouter un événement"}
              </Button>
            </div>
          </ScrollArea>
        </div>

        {/* Right preview area */}
        <div
          className="flex flex-col h-full overflow-hidden"
          style={{ width: "60%" }}
        >
          <div
            className="flex items-center justify-between px-3 py-2 border-b text-xs font-medium flex-shrink-0"
            style={{ borderColor: colors.border }}
          >
            <span>Aperçu</span>
            <span className="text-muted-foreground">
              {mode === "gantt"
                ? `${tasks.length} tâche${tasks.length > 1 ? "s" : ""}`
                : `${events.length} événement${events.length > 1 ? "s" : ""}`}
            </span>
          </div>
          <div className="flex-1 overflow-hidden p-2">
            {mode === "gantt" ? (
              <div
                className="w-full h-full rounded-lg border overflow-hidden"
                style={{ borderColor: colors.border }}
              >
                <GanttEngine
                  tasks={tasks}
                  colors={colors}
                  fonts={fonts}
                  scale={1}
                  viewMode={viewMode}
                />
              </div>
            ) : (
              <div
                className="w-full h-full rounded-lg border overflow-hidden"
                style={{ borderColor: colors.border }}
              >
                <TimelineEngine
                  events={events}
                  colors={colors}
                  fonts={fonts}
                  scale={1}
                  viewMode={viewMode}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-t flex-shrink-0"
        style={{ borderColor: colors.border }}
      >
        <Button
          size="sm"
          variant="ghost"
          onClick={handleReset}
          disabled={tasks.length === 0 && events.length === 0}
        >
          <RotateCcw className="size-3.5 mr-1" />
          Réinitialiser
        </Button>

        <Button
          size="sm"
          onClick={handleInsert}
          disabled={!canInsert}
        >
          <Save className="size-3.5 mr-1" />
          Insérer dans la présentation
        </Button>
      </div>
    </div>
  );
}
