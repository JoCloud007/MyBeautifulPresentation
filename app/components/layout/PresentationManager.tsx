"use client";

import { useState, useEffect, useCallback } from "react";
import { Presentation } from "@/app/types/presentation";
import { usePresentationStore } from "@/app/stores/presentationStore";

interface SavedPresentation {
  id: string;
  title: string;
  updatedAt: number;
  slideCount: number;
}

const STORAGE_KEY = "mybp-presentations-list";

function loadPresentationsList(): SavedPresentation[] {
  if (typeof window === "undefined") return [];
  try {
    // Clean up orphaned mybp-pres-* entries that are not in the cached list
    const cachedRaw = localStorage.getItem(STORAGE_KEY);
    const cachedIds = new Set<string>();
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as SavedPresentation[];
        for (const c of cached) cachedIds.add(c.id);
      } catch { /* ignore */ }
    }
    // Remove orphaned entries to prevent duplicates
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith("mybp-pres-") && key !== STORAGE_KEY && !cachedIds.has(key.slice("mybp-pres-".length))) {
        localStorage.removeItem(key);
      }
    }

    // Read from cached list only (the source of truth)
    const list: SavedPresentation[] = [];
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as SavedPresentation[];
        for (const c of cached) {
          // Skip empty default presentations (created by old buggy versions)
          if (c.title === "Nouvelle Présentation" && c.slideCount <= 1) continue;
          list.push(c);
        }
      } catch {
        // Ignore corrupted cache
      }
    }

    // Also include the current active presentation if it exists
    const currentRaw = localStorage.getItem("mybp-current-presentation");
    if (currentRaw) {
      try {
        const current = JSON.parse(currentRaw) as Presentation;
        if (current && current.id && !list.some((p) => p.id === current.id)) {
          list.unshift({
            id: current.id,
            title: current.title || "Sans titre",
            updatedAt: current.updatedAt || Date.now(),
            slideCount: current.slides?.length || 0,
          });
        }
      } catch { /* ignore */ }
    }

    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function savePresentationsList(list: SavedPresentation[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded or storage disabled — silently fail
  }
}

function savePresentationData(id: string, presentation: Presentation) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`mybp-pres-${id}`, JSON.stringify(presentation));
  } catch {
    // Quota exceeded or storage disabled — silently fail
  }
}

function loadPresentationData(id: string): Presentation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`mybp-pres-${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function deletePresentationData(id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`mybp-pres-${id}`);
}

interface PresentationManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PresentationManager({ open, onOpenChange }: PresentationManagerProps) {
  const [presentations, setPresentations] = useState<SavedPresentation[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const store = usePresentationStore();

  useEffect(() => {
    if (open) {
      setPresentations(loadPresentationsList());
    }
  }, [open]);

  const refreshList = useCallback(() => {
    setPresentations(loadPresentationsList());
  }, []);

  const handleSaveCurrent = useCallback(() => {
    const pres = store.presentation;
    if (!pres) return;
    const list = loadPresentationsList();
    const existingIndex = list.findIndex((p) => p.id === pres.id);
    const updated: SavedPresentation = {
      id: pres.id,
      title: pres.title || "Sans titre",
      updatedAt: Date.now(),
      slideCount: pres.slides.length,
    };
    if (existingIndex >= 0) {
      list[existingIndex] = updated;
    } else {
      list.push(updated);
    }
    savePresentationsList(list);
    savePresentationData(pres.id, pres);
    refreshList();
  }, [store.presentation, refreshList]);

  const handleLoad = useCallback((id: string) => {
    // Save current presentation before switching
    const currentPres = store.presentation;
    if (currentPres) {
      const list = loadPresentationsList();
      const existingIndex = list.findIndex((p) => p.id === currentPres.id);
      const entry: SavedPresentation = {
        id: currentPres.id,
        title: currentPres.title || "Sans titre",
        updatedAt: Date.now(),
        slideCount: currentPres.slides.length,
      };
      if (existingIndex >= 0) {
        list[existingIndex] = entry;
      } else {
        list.unshift(entry);
      }
      savePresentationsList(list);
      savePresentationData(currentPres.id, currentPres);
    }
    // Load the selected presentation
    const data = loadPresentationData(id);
    if (data) {
      store.setPresentation(data);
      store.setCurrentSlide(0);
    }
    onOpenChange(false);
  }, [store, onOpenChange]);

  const handleDelete = useCallback((id: string) => {
    const list = loadPresentationsList().filter((p) => p.id !== id);
    savePresentationsList(list);
    deletePresentationData(id);
    refreshList();
  }, [refreshList]);

  const handleRename = useCallback((id: string) => {
    const list = loadPresentationsList().map((p) =>
      p.id === id ? { ...p, title: renameValue || p.title } : p
    );
    savePresentationsList(list);
    // Also update the stored presentation data
    const data = loadPresentationData(id);
    if (data) {
      savePresentationData(id, { ...data, title: renameValue || data.title });
    }
    // If this is the currently loaded presentation, update the store too
    if (store.presentation?.id === id) {
      store.updatePresentationMeta({ title: renameValue || store.presentation.title });
    }
    setRenamingId(null);
    refreshList();
  }, [renameValue, refreshList, store]);

  const handleDuplicate = useCallback((id: string) => {
    const data = loadPresentationData(id);
    if (!data) return;
    const newId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
    const newPres: Presentation = {
      ...data,
      id: newId,
      title: `${data.title || "Copie"} (copie)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const list = loadPresentationsList();
    list.push({
      id: newId,
      title: newPres.title,
      updatedAt: Date.now(),
      slideCount: newPres.slides.length,
    });
    savePresentationsList(list);
    savePresentationData(newId, newPres);
    refreshList();
  }, [refreshList]);

  const handleNew = useCallback(() => {
    store.resetPresentation();
    const pres = usePresentationStore.getState().presentation;
    if (pres) {
      const list = loadPresentationsList();
      list.push({
        id: pres.id,
        title: pres.title || "Sans titre",
        updatedAt: Date.now(),
        slideCount: pres.slides.length,
      });
      savePresentationsList(list);
      savePresentationData(pres.id, pres);
      refreshList();
    }
    onOpenChange(false);
  }, [store, onOpenChange, refreshList]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => onOpenChange(false)}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Gestion des présentations</h2>
          <button onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            ✕
          </button>
        </div>

        <div className="flex gap-2 px-4 py-3 border-b border-slate-200">
          <button
            onClick={handleNew}
            className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 cursor-pointer transition-colors"
          >
            + Nouvelle
          </button>
          <button
            onClick={handleSaveCurrent}
            disabled={!store.presentation}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Sauvegarder l&apos;actuelle
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {presentations.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-8">
              Aucune présentation sauvegardée
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {presentations.map((pres) => (
                <div
                  key={pres.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    {renamingId === pres.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(pres.id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          autoFocus
                          className="flex-1 px-2 py-1 text-xs border rounded outline-none focus:border-slate-500"
                        />
                        <button
                          onClick={() => handleRename(pres.id)}
                          className="px-2 py-1 text-xs bg-slate-900 text-white rounded cursor-pointer"
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-xs font-semibold text-slate-800 truncate">{pres.title}</div>
                        <div className="text-[10px] text-slate-400">
                          {pres.slideCount} slide{pres.slideCount > 1 ? "s" : ""} · {new Date(pres.updatedAt).toLocaleDateString("fr-FR")}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleLoad(pres.id)}
                      className="px-2 py-1 text-[10px] bg-slate-100 text-slate-700 rounded hover:bg-slate-200 cursor-pointer transition-colors"
                      title="Charger"
                    >
                      Charger
                    </button>
                    <button
                      onClick={() => {
                        setRenamingId(pres.id);
                        setRenameValue(pres.title);
                      }}
                      className="px-2 py-1 text-[10px] bg-slate-100 text-slate-700 rounded hover:bg-slate-200 cursor-pointer transition-colors"
                      title="Renommer"
                    >
                      Renommer
                    </button>
                    <button
                      onClick={() => handleDuplicate(pres.id)}
                      className="px-2 py-1 text-[10px] bg-slate-100 text-slate-700 rounded hover:bg-slate-200 cursor-pointer transition-colors"
                      title="Dupliquer"
                    >
                      Dup
                    </button>
                    <button
                      onClick={() => handleDelete(pres.id)}
                      className="px-2 py-1 text-[10px] bg-red-50 text-red-600 rounded hover:bg-red-100 cursor-pointer transition-colors"
                      title="Supprimer"
                    >
                      Suppr
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
