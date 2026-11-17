"use client";

import { useEffect, useMemo, useState } from "react";
import { Template } from "@/app/types/template";

/**
 * Charge dynamiquement les polices déclarées par un template de marque.
 *
 * Pourquoi c'est nécessaire : `template.fonts.heading` n'est qu'un NOM. Si la
 * webfont du client n'est pas chargée, le navigateur retombe silencieusement sur
 * la police de repli — et l'export hybride capture ce rendu de repli dans le
 * PPTX. Le client reçoit alors une présentation à la mauvaise typographie, sans
 * aucune erreur visible.
 *
 * Mécanisme : `FontFace` + `document.fonts.add()`, puis on attend
 * `document.fonts.load()` pour que l'export sache que la police est prête
 * (`lib/htmlExport/fonts.ts` attend déjà `document.fonts.ready`).
 *
 * Les URL ne sont jamais téléchargées côté serveur : ce hook tourne uniquement
 * dans le navigateur, à la charge du déployeur.
 */

export type FontLoadState = "idle" | "loading" | "ready" | "partial" | "unsupported";

export interface FontLoadResult {
  state: FontLoadState;
  /** Familles effectivement chargées. */
  loaded: string[];
  /** Familles en échec, avec la raison (licence, 404, CORS…). */
  failed: Array<{ family: string; url: string; error: string }>;
}

interface StoredResult extends FontLoadResult {
  /** Clé des sources qui a produit ce résultat. */
  key: string;
}

const IDLE: FontLoadResult = { state: "idle", loaded: [], failed: [] };

export function useBrandFonts(template: Template | null | undefined): FontLoadResult {
  // Dépendance sur la liste sérialisée : un `template` recréé à chaque rendu ne
  // doit pas relancer le chargement en boucle.
  const sources = useMemo(() => template?.fontSources ?? [], [template]);
  const key = sources.map((f) => `${f.family}|${f.url}|${f.weight ?? ""}`).join(";");

  const [stored, setStored] = useState<StoredResult>({ key: "", ...IDLE });

  // État DÉRIVÉ : tant que le résultat stocké ne correspond pas à la clé
  // courante, on estime « en attente ». Cela évite un setState synchrone dans
  // l'effet (rendus en cascade), tout en n'affichant jamais un résultat périmé.
  const result: FontLoadResult =
    !key
      ? IDLE
      : stored.key === key
        ? stored
        : { state: "loading", loaded: [], failed: [] };

  useEffect(() => {
    if (!key) return;

    if (typeof window === "undefined" || typeof FontFace === "undefined") {
      // Pas de support : on le dit, sans tenter de charger.
      queueMicrotask(() => {
        setStored({
          key,
          state: "unsupported",
          loaded: [],
          failed: [],
        });
      });
      return;
    }

    let cancelled = false;
    const loaded: string[] = [];
    const failed: FontLoadResult["failed"] = [];

    async function run() {
      for (const source of sources) {
        try {
          const face = new FontFace(source.family, `url(${source.url})`, {
            weight: source.weight ?? "400",
            style: source.style ?? "normal",
          });
          await face.load();
          if (cancelled) return;
          document.fonts.add(face);
          loaded.push(source.family);
        } catch (error) {
          // Une police manquante n'est pas fatale : le repli du `font-family`
          // s'applique et l'utilisateur est prévenu.
          failed.push({
            family: source.family,
            url: source.url,
            error: error instanceof Error ? error.message : "chargement impossible",
          });
        }
      }
      if (cancelled) return;
      setStored({
        key,
        state: failed.length === 0 ? "ready" : "partial",
        loaded,
        failed,
      });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [key, sources]);

  return result;
}
