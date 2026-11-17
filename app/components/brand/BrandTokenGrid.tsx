"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  BrandToken,
  BrandTokens,
  BRAND_COLOR_ROLES,
  BrandColorRole,
} from "@/lib/brand/types";
import { emptyBrandTokens } from "@/lib/brand/types";
import { contrastRatio } from "@/lib/brand/normalizeColor";

/**
 * Grille de tokens de charte, éditable.
 *
 * Chaque rôle affiche sa valeur, sa **confiance** et son **évidence** : c'est ce
 * qui permet à un utilisateur de valider la charte en quelques secondes au lieu
 * de re-vérifier sept couleurs contre le document du client. Une valeur déduite
 * est explicitement marquée comme telle.
 */

const ROLE_LABELS: Record<BrandColorRole, string> = {
  primary: "Primaire",
  secondary: "Secondaire",
  accent: "Accent",
  background: "Fond",
  foreground: "Texte",
  muted: "Surface",
  border: "Bordure",
};

const ROLE_HINTS: Record<BrandColorRole, string> = {
  primary: "La couleur d'identité, celle que le client reconnaît",
  secondary: "Couleur d'appui pour le texte secondaire",
  accent: "Mise en avant ponctuelle (filets, chiffres clés)",
  background: "Fond des slides",
  foreground: "Couleur du texte principal",
  muted: "Fond des cartes et encadrés",
  border: "Traits de séparation",
};

interface BrandTokenGridProps {
  brand: BrandTokens;
  onChange: (next: BrandTokens) => void;
}

export function BrandTokenGrid({ brand, onChange }: BrandTokenGridProps) {
  const updateColor = useCallback(
    (role: BrandColorRole, value: string) => {
      const current = brand.colors[role];
      // Toute valeur touchée par l'utilisateur devient `manual` avec une
      // confiance maximale : c'est désormais une décision humaine, pas une
      // déduction à re-questionner.
      const token: BrandToken<string> = {
        value,
        source: "manual",
        confidence: 1,
        evidence: current?.evidence
          ? `corrigé manuellement (était ${current.value})`
          : "saisi manuellement",
      };
      onChange({ ...brand, colors: { ...brand.colors, [role]: token } });
    },
    [brand, onChange]
  );

  const removeColor = useCallback(
    (role: BrandColorRole) => {
      const next = { ...brand.colors };
      delete next[role];
      onChange({ ...brand, colors: next });
    },
    [brand, onChange]
  );

  const background = brand.colors.background?.value ?? "#ffffff";
  const foreground = brand.colors.foreground?.value ?? "#000000";
  const ratio = contrastRatio(foreground, background);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2">
        {BRAND_COLOR_ROLES.map((role) => {
          const token = brand.colors[role];
          if (!token) {
            return (
              <div
                key={role}
                className="flex items-center justify-between rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2"
              >
                <div>
                  <div className="text-xs font-medium text-slate-600">
                    {ROLE_LABELS[role]}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    non trouvé — {ROLE_HINTS[role]}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateColor(role, "#808080")}
                  className="text-[11px] text-slate-600 underline hover:text-slate-900"
                >
                  Définir
                </button>
              </div>
            );
          }

          return (
            <ColorRow
              key={role}
              role={role}
              token={token}
              onChange={(value) => updateColor(role, value)}
              onRemove={() => removeColor(role)}
            />
          );
        })}
      </div>

      {/* Contrôle de lisibilité global */}
      <div
        className={
          ratio < 4.5
            ? "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
            : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800"
        }
      >
        Contraste texte sur fond :{" "}
        <strong>{ratio.toFixed(2)}:1</strong>
        {ratio < 4.5
          ? " — sous le minimum WCAG AA (4.5:1). Le texte risque d'être illisible en projection."
          : " — conforme WCAG AA."}
      </div>
    </div>
  );
}

function ColorRow({
  role,
  token,
  onChange,
  onRemove,
}: {
  role: BrandColorRole;
  token: BrandToken<string>;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(token.value);
  const isValid = /^#[0-9a-f]{6}$/i.test(draft);

  const commit = (value: string) => {
    setDraft(value);
    if (/^#[0-9a-f]{6}$/i.test(value)) onChange(value.toLowerCase());
  };

  const confidencePct = Math.round(token.confidence * 100);
  const isDerived = token.source === "derived";

  return (
    <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
      <input
        type="color"
        aria-label={`Couleur ${ROLE_LABELS[role]}`}
        value={isValid ? draft : token.value}
        onChange={(e) => commit(e.target.value)}
        className="mt-0.5 h-8 w-8 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-slate-800">
            {ROLE_LABELS[role]}
          </span>
          <span className="flex items-center gap-1.5">
            {isDerived && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                déduit
              </span>
            )}
            <span
              className={
                confidencePct >= 80
                  ? "text-[10px] text-emerald-600"
                  : confidencePct >= 50
                    ? "text-[10px] text-amber-600"
                    : "text-[10px] text-slate-400"
              }
            >
              {confidencePct}%
            </span>
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            spellCheck={false}
            className={
              isValid
                ? "w-24 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-700"
                : "w-24 rounded border border-red-400 px-1.5 py-0.5 font-mono text-[11px] text-red-600"
            }
          />
          <span className="truncate text-[10px] text-slate-400" title={token.evidence}>
            {token.evidence ?? ROLE_HINTS[role]}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto shrink-0 text-[10px] text-slate-400 hover:text-red-600"
            aria-label={`Retirer ${ROLE_LABELS[role]}`}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

/** État vide : évite un composant à moitié rendu quand aucune analyse n'a eu lieu. */
export function emptyBrand(name = "Nouvelle charte"): BrandTokens {
  return emptyBrandTokens(name);
}

/** Résumé compact des rôles, utilisé dans l'étape de confirmation. */
export function useColorSummary(brand: BrandTokens): Array<{ role: BrandColorRole; value: string }> {
  return useMemo(
    () =>
      BRAND_COLOR_ROLES.filter((role) => brand.colors[role]).map((role) => ({
        role,
        value: brand.colors[role]!.value,
      })),
    [brand]
  );
}
