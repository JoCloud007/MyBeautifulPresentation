"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Template, TemplateLogo } from "@/app/types/template";
import { BrandTokens, BrandParseError } from "@/lib/brand/types";
import { brandToTemplate, BrandArchetype } from "@/lib/brand/toTemplate";
import { useTemplateStore } from "@/app/stores/templateStore";
import { useBrandFonts } from "@/app/hooks/useBrandFonts";
import { BrandTokenGrid } from "./BrandTokenGrid";
import { BrandPreview, SAMPLE_LAYOUTS, SampleLayout } from "./BrandPreview";
import type { AnalyzeBrandResult } from "@/lib/brand/analyze";

/**
 * Assistant d'import de charte client, en quatre étapes.
 *
 * La contrainte structurante : chez un client, l'import doit être **vérifiable**,
 * pas magique. Chaque étape montre ce qui a été lu, ce qui a été déduit, et
 * laisse corriger avant d'enregistrer. C'est ce qui évite de livrer une
 * présentation « presque » à la charte.
 */

type Step = "files" | "colors" | "assets" | "review";

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "files", label: "1. Fichiers" },
  { id: "colors", label: "2. Couleurs & polices" },
  { id: "assets", label: "3. Logo & style" },
  { id: "review", label: "4. Aperçu" },
];

const ARCHETYPES: Array<{ id: BrandArchetype; label: string }> = [
  { id: "corporate", label: "Corporate" },
  { id: "minimal", label: "Minimal" },
  { id: "editorial", label: "Editorial" },
  { id: "tech", label: "Tech" },
  { id: "dark-tech", label: "Dark Tech" },
  { id: "dark-luxury", label: "Dark Luxury" },
  { id: "creative", label: "Creative" },
  { id: "startup", label: "Startup" },
  { id: "academic", label: "Academic" },
];

const PLACEMENTS: Array<{ id: TemplateLogo["placement"]; label: string }> = [
  { id: "header-left", label: "En-tête gauche" },
  { id: "header-right", label: "En-tête droite" },
  { id: "title", label: "Page de titre" },
  { id: "footer-left", label: "Pied gauche" },
  { id: "footer-right", label: "Pied droite" },
];

interface BrandImportWizardProps {
  onClose: () => void;
  onCreated?: (template: Template) => void;
}

export function BrandImportWizard({ onClose, onCreated }: BrandImportWizardProps) {
  const [step, setStep] = useState<Step>("files");

  // Étape 1 — fichiers
  const [files, setFiles] = useState<File[]>([]);
  const [clientName, setClientName] = useState("");
  const [mode, setMode] = useState<"auto" | "light" | "dark">("auto");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perFile, setPerFile] = useState<AnalyzeBrandResult["perFile"]>([]);

  // Étape 2 — tokens
  const [brand, setBrand] = useState<BrandTokens | null>(null);

  // Étape 3 — assets & style
  const [selectedLogoId, setSelectedLogoId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<TemplateLogo["placement"]>("header-left");
  const [maxHeight, setMaxHeight] = useState(8);
  const [archetype, setArchetype] = useState<BrandArchetype | "auto">("auto");
  const [accentOverride, setAccentOverride] = useState<string>("");

  // Étape 4 — aperçu
  const [layout, setLayout] = useState<SampleLayout>("title-content");
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTemplates = useTemplateStore((s) => s.addCustomTemplate);
  const setActiveTemplate = useTemplateStore((s) => s.setActiveTemplate);
  const setSavingError = setError;

  /* ---------------------------------------------------------------- */
  /* Étape 1 — analyse                                                */
  /* ---------------------------------------------------------------- */

  const handleFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const accepted = Array.from(incoming).filter((file) =>
      /\.(css|pptx|potx|pdf|svg|png|jpe?g)$/i.test(file.name)
    );
    const rejected = Array.from(incoming).length - accepted.length;
    setFiles((prev) => [...prev, ...accepted]);
    setError(
      rejected > 0
        ? `${rejected} fichier(s) ignoré(s) : formats acceptés = CSS, PPTX, PDF, SVG, PNG, JPG.`
        : null
    );
  }, []);

  const analyze = useCallback(async () => {
    if (files.length === 0) {
      setError("Ajoutez au moins un fichier de charte.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      form.append("name", clientName.trim() || "Charte client");
      if (mode !== "auto") form.append("mode", mode);

      const res = await fetch("/api/brand/analyze", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "L'analyse a échoué.");
        return;
      }

      setBrand({
        name: data.name,
        colors: data.colors ?? {},
        colorCandidates: data.colorCandidates ?? [],
        fonts: data.fonts ?? { faces: [] },
        logos: data.logos ?? [],
        icons: data.icons ?? [],
        sources: data.sources ?? [],
        warnings: data.warnings ?? [],
      });
      setPerFile(data.perFile ?? []);
      setSelectedLogoId(data.logos?.[0]?.id ?? null);
      setStep("colors");
    } catch (err) {
      setError(
        err instanceof BrandParseError
          ? err.message
          : "Impossible de joindre le serveur d'analyse."
      );
    } finally {
      setAnalyzing(false);
    }
  }, [files, clientName, mode]);

  /* ---------------------------------------------------------------- */
  /* Étape 3/4 — template                                             */
  /* ---------------------------------------------------------------- */

  const selectedLogo = useMemo<TemplateLogo | undefined>(() => {
    if (!brand || !selectedLogoId) return undefined;
    const logo = brand.logos.find((l) => l.id === selectedLogoId);
    if (!logo?.dataUrl) return undefined;
    return {
      url: logo.dataUrl,
      alt: clientName || brand.name,
      placement,
      maxHeight,
      opacity: 1,
    };
  }, [brand, selectedLogoId, clientName, placement, maxHeight]);

  const previewTemplate = useMemo<Template | null>(() => {
    if (!brand) return null;
    return brandToTemplate(brand, {
      name: clientName.trim() || brand.name,
      archetype: archetype === "auto" ? undefined : archetype,
      accentOverride: accentOverride || undefined,
      logo: selectedLogo,
      icons: brand.icons.map((i) => ({ name: i.name, svg: i.svg ?? "" })).filter((i) => i.svg),
    });
  }, [brand, clientName, archetype, accentOverride, selectedLogo]);

  const fontState = useBrandFonts(previewTemplate);

  /* ---------------------------------------------------------------- */
  /* Enregistrement                                                    */
  /* ---------------------------------------------------------------- */

  const save = useCallback(async () => {
    if (!previewTemplate) return;
    setSaving(true);
    setError(null);
    try {
      // 1. La source de vérité du rendu est le store local.
      addTemplates(previewTemplate);
      setActiveTemplate(previewTemplate.id);

      // 2. Persistance en base, pour que le template survive à un autre poste
      //    et soit livrable. Un échec ici n'invalide pas le template local :
      //    on le signale sans bloquer l'utilisateur.
      try {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: previewTemplate.id,
            source: "brand",
            template: previewTemplate,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(
            `Template activé localement. Enregistrement en base impossible : ${
              data?.error ?? res.statusText
            }`
          );
        }
      } catch {
        setSavingError(
          "Template activé localement. La base de données est injoignable ; exportez le .mbpt.json pour le conserver."
        );
      }

      onCreated?.(previewTemplate);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [previewTemplate, addTemplates, setActiveTemplate, onCreated, onClose]);

  /* ---------------------------------------------------------------- */
  /* Rendu                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Barre d'étapes */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-1">
          {STEPS.map((s) => {
            const isCurrent = s.id === step;
            const isDone =
              STEPS.findIndex((x) => x.id === step) > STEPS.findIndex((x) => x.id === s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                disabled={s.id !== "files" && !brand}
                className={
                  isCurrent
                    ? "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                    : isDone
                      ? "rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      : "rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 disabled:cursor-not-allowed"
                }
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Fermer
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-3 whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {/* ---------------- Étape 1 ---------------- */}
        {step === "files" && (
          <div className="mx-auto max-w-2xl space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Nom du client
              </label>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Acme Industries"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Fichiers de charte
              </label>
              <p className="mt-1 text-[11px] text-slate-500">
                CSS / PPTX (meilleure source) / PDF de guidelines / SVG, PNG, JPG pour
                le logo et les pictogrammes.
              </p>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
                className="mt-2 w-full rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-8 text-center hover:border-slate-400"
              >
                <div className="text-sm font-medium text-slate-700">
                  Déposer les fichiers ou cliquer pour parcourir
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  25 Mo par fichier · 40 Mo au total
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".css,.pptx,.potx,.pdf,.svg,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                  >
                    <span className="truncate text-slate-700">{file.name}</span>
                    <span className="ml-3 shrink-0 text-slate-400">
                      {(file.size / 1024).toFixed(0)} Ko
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="ml-3 text-slate-400 hover:text-red-600"
                      aria-label={`Retirer ${file.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-slate-700">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="auto">Détection automatique</option>
                <option value="light">Charte claire</option>
                <option value="dark">Charte sombre</option>
              </select>
            </div>

            <button
              type="button"
              onClick={analyze}
              disabled={analyzing || files.length === 0}
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {analyzing ? "Analyse…" : "Analyser la charte"}
            </button>
          </div>
        )}

        {/* ---------------- Étape 2 ---------------- */}
        {step === "colors" && brand && (
          <div className="mx-auto max-w-3xl space-y-4">
            {/* Ce qui a été lu, fichier par fichier */}
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-xs font-medium text-slate-700">Sources lues</div>
              <ul className="mt-1.5 space-y-1">
                {perFile.map((entry) => (
                  <li key={entry.name} className="flex items-start gap-2 text-[11px]">
                    <span className={entry.ok ? "text-emerald-600" : "text-red-600"}>
                      {entry.ok ? "✓" : "✗"}
                    </span>
                    <span className="text-slate-600">
                      <strong>{entry.name}</strong>
                      {" — "}
                      {entry.ok ? entry.notes.join(", ") || "lu" : entry.error}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <BrandTokenGrid brand={brand} onChange={setBrand} />

            {/* Polices */}
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-xs font-medium text-slate-700">Polices</div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-500">Titres</label>
                  <div className="mt-0.5 rounded border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-700">
                    {brand.fonts.heading?.value ?? "— police système —"}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Corps</label>
                  <div className="mt-0.5 rounded border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-700">
                    {brand.fonts.body?.value ?? "— police système —"}
                  </div>
                </div>
              </div>
              {brand.fonts.faces.length > 0 && (
                <p className="mt-2 text-[11px] text-slate-500">
                  {brand.fonts.faces.length} fichier(s) de police déclaré(s) :{" "}
                  {brand.fonts.faces.map((f) => f.family).join(", ")}. Ils seront chargés
                  à l&apos;affichage et avant l&apos;export.
                </p>
              )}
            </div>

            {/* Avertissements */}
            {brand.warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs font-medium text-amber-800">
                  Points à vérifier
                </div>
                <ul className="mt-1 space-y-1">
                  {brand.warnings.map((warning, i) => (
                    <li key={i} className="text-[11px] text-amber-800">
                      • {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep("files")}
                className="rounded-md border border-slate-300 px-4 py-2 text-xs text-slate-600 hover:bg-slate-100"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={() => setStep("assets")}
                className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                Continuer
              </button>
            </div>
          </div>
        )}

        {/* ---------------- Étape 3 ---------------- */}
        {step === "assets" && brand && (
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-xs font-medium text-slate-700">
                Logo ({brand.logos.length} candidat
                {brand.logos.length > 1 ? "s" : ""})
              </div>
              {brand.logos.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  Aucun logo trouvé. Ajoutez un SVG ou un PNG à l&apos;étape 1 pour
                  l&apos;afficher sur les slides.
                </p>
              ) : (
                <>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {brand.logos.map((logo) => (
                      <button
                        key={logo.id}
                        type="button"
                        onClick={() => setSelectedLogoId(logo.id)}
                        className={
                          logo.id === selectedLogoId
                            ? "flex h-16 items-center justify-center rounded border-2 border-slate-900 bg-slate-50 p-1"
                            : "flex h-16 items-center justify-center rounded border border-slate-200 bg-white p-1 hover:border-slate-400"
                        }
                        title={logo.name}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logo.dataUrl}
                          alt={logo.name}
                          className="max-h-full max-w-full object-contain"
                        />
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-500">Emplacement</label>
                      <select
                        value={placement}
                        onChange={(e) =>
                          setPlacement(e.target.value as TemplateLogo["placement"])
                        }
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      >
                        {PLACEMENTS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="flex justify-between text-[11px] text-slate-500">
                        <span>Taille</span>
                        <span>{maxHeight}</span>
                      </label>
                      <input
                        type="range"
                        min={2}
                        max={20}
                        value={maxHeight}
                        onChange={(e) => setMaxHeight(Number(e.target.value))}
                        className="mt-2 w-full"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-xs font-medium text-slate-700">
                Structure de mise en page
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Les couleurs et polices viennent de la charte ; cette structure définit
                l&apos;agencement et les arrondis.
              </p>
              <div className="mt-2 grid grid-cols-5 gap-2">
                <button
                  type="button"
                  onClick={() => setArchetype("auto")}
                  className={
                    archetype === "auto"
                      ? "rounded border-2 border-slate-900 px-2 py-1 text-[11px]"
                      : "rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-400"
                  }
                >
                  Auto
                </button>
                {ARCHETYPES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setArchetype(a.id)}
                    className={
                      archetype === a.id
                        ? "rounded border-2 border-slate-900 px-2 py-1 text-[11px]"
                        : "rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-400"
                    }
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-xs font-medium text-slate-700">
                Couleur d&apos;identité
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Le template n&apos;a qu&apos;un emplacement de couleur d&apos;identité
                (filets, graphiques, décor). Par défaut c&apos;est la primaire de la
                charte.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={accentOverride || previewTemplate?.colors.accent || "#1e40af"}
                  onChange={(e) => setAccentOverride(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-slate-300 p-0.5"
                />
                <span className="font-mono text-[11px] text-slate-600">
                  {accentOverride || previewTemplate?.colors.accent}
                </span>
                {accentOverride && (
                  <button
                    type="button"
                    onClick={() => setAccentOverride("")}
                    className="text-[11px] text-slate-500 underline"
                  >
                    Rétablir la primaire
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep("colors")}
                className="rounded-md border border-slate-300 px-4 py-2 text-xs text-slate-600 hover:bg-slate-100"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={() => setStep("review")}
                className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                Aperçu
              </button>
            </div>
          </div>
        )}

        {/* ---------------- Étape 4 ---------------- */}
        {step === "review" && previewTemplate && (
          <div className="mx-auto max-w-3xl space-y-4">
            <BrandPreview
              template={previewTemplate}
              layout={layout}
              onLayoutChange={setLayout}
            />

            {fontState.state === "partial" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Certaines polices n&apos;ont pas pu être chargées (
                {fontState.failed.map((f) => f.family).join(", ")}). L&apos;aperçu
                utilise la police de repli ; vérifiez que les fichiers de police sont
                accessibles.
              </div>
            )}
            {fontState.state === "ready" && fontState.loaded.length > 0 && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                Polices chargées : {fontState.loaded.join(", ")}.
              </div>
            )}

            <div className="rounded-md border border-slate-200 bg-white p-3 text-[11px] text-slate-600">
              <div>
                <strong>Template</strong> : {previewTemplate.name}
              </div>
              <div>
                <strong>Identifiant</strong> :{" "}
                <span className="font-mono">{previewTemplate.id}</span>
              </div>
              <div>
                <strong>Provenance</strong> :{" "}
                {previewTemplate.brand?.sourceName ?? "saisie manuelle"}
              </div>
              <div>
                <strong>Layouts</strong> : {previewTemplate.defaultSlides.length}
              </div>
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep("assets")}
                className="rounded-md border border-slate-300 px-4 py-2 text-xs text-slate-600 hover:bg-slate-100"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
              >
                {saving ? "Enregistrement…" : "Enregistrer et activer"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { SAMPLE_LAYOUTS };
