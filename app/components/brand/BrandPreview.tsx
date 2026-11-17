"use client";

import { Template, TemplateLogoPlacement } from "@/app/types/template";
import { contrastRatio } from "@/lib/brand/normalizeColor";

/**
 * Aperçu réel du template de marque.
 *
 * Ce composant ne réimplémente PAS un rendu de slide : il affiche une slide
 * factice construite avec les vrais champs du template (couleurs, polices,
 * espacements, décor). Un aperçu qui divergerait du moteur de rendu ferait
 * valider au client autre chose que ce qu'il obtiendra.
 */

const SAMPLE_LAYOUTS = [
  { id: "title", label: "Titre" },
  { id: "title-content", label: "Titre + contenu" },
  { id: "two-column", label: "Deux colonnes" },
] as const;

type SampleLayout = (typeof SAMPLE_LAYOUTS)[number]["id"];

interface BrandPreviewProps {
  template: Template;
  layout: SampleLayout;
  onLayoutChange: (layout: SampleLayout) => void;
  /** Nombre de layouts disponibles est piloté par le parent. */
  className?: string;
}

export function BrandPreview({
  template,
  layout,
  onLayoutChange,
  className = "",
}: BrandPreviewProps) {
  const { colors, fonts } = template;
  const background = template.background;
  const isGradient = background?.type === "gradient" && background.gradient;

  const surfaceStyle: React.CSSProperties = isGradient
    ? {
        background: `linear-gradient(${background!.gradient!.direction}, ${background!.gradient!.stops
          .map((s) => `${s.color} ${s.position}%`)
          .join(", ")})`,
      }
    : { backgroundColor: background?.color ?? colors.background };

  const textContrast = contrastRatio(colors.foreground, colors.background);
  const lowContrast = textContrast < 4.5;

  return (
    <div className={className}>
      {/* Sélecteur de layout */}
      <div className="flex items-center gap-2 mb-3">
        {SAMPLE_LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onLayoutChange(l.id)}
            className={
              l.id === layout
                ? "px-2.5 py-1 text-[11px] rounded-md bg-slate-900 text-white"
                : "px-2.5 py-1 text-[11px] rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
            }
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* Slide 16:9 */}
      <div
        className="relative w-full overflow-hidden rounded-lg border border-slate-200 shadow-sm"
        style={{ aspectRatio: "16 / 9", ...surfaceStyle }}
      >
        {/* Décor de marque */}
        {template.slideTheme === "brand" && (
          <>
            <div
              className="absolute top-0 left-0 right-0"
              style={{ height: "1.1%", background: colors.accent }}
            />
            <div
              className="absolute"
              style={{
                bottom: "6%",
                right: "5%",
                width: "8%",
                height: "0.45%",
                minHeight: "1px",
                background: colors.accent,
                opacity: 0.35,
                borderRadius: "999px",
              }}
            />
          </>
        )}

        {/* Logo — même géométrie que BrandLogo et que l'export PPTX */}
        {template.logo?.url && (
          <div
            className="absolute z-20"
            style={logoBoxStyle(template.logo.placement, template.logo.maxHeight)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={template.logo.url}
              alt={template.logo.alt ?? ""}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "left center",
              }}
            />
          </div>
        )}

        {/* Contenu d'exemple */}
        <div
          className="absolute inset-0 flex flex-col justify-center"
          style={{
            padding: "6% 7%",
            fontFamily: fonts.body,
            color: colors.foreground,
          }}
        >
          {layout !== "two-column" && (
            <>
              <div
                style={{
                  width: "14%",
                  height: 3,
                  backgroundColor: colors.accent,
                  borderRadius: 2,
                  marginBottom: "3%",
                }}
              />
              <h2
                style={{
                  fontFamily: fonts.heading,
                  fontSize: "clamp(14px, 2.6vw, 30px)",
                  lineHeight: 1.15,
                  fontWeight: 700,
                  color: colors.foreground,
                  marginBottom: "3%",
                }}
              >
                Un titre à la charte du client
              </h2>
            </>
          )}

          {layout === "title" ? null : layout === "title-content" ? (
            <div
              style={{
                backgroundColor: colors.muted,
                border: `1px solid ${colors.border}`,
                borderRadius: (template.borderRadius?.md ?? 8) / 2,
                padding: "3%",
                fontSize: "clamp(8px, 1.05vw, 13px)",
                color: colors.secondary,
                lineHeight: 1.5,
              }}
            >
              Les blocs de contenu reprennent la surface, les bordures et les
              arrondis de la charte.
            </div>
          ) : (
            <div style={{ display: "flex", gap: "4%" }}>
              {[1, 2].map((n) => (
                <div
                  key={n}
                  style={{
                    flex: 1,
                    backgroundColor: colors.muted,
                    border: `1px solid ${colors.border}`,
                    borderRadius: (template.borderRadius?.md ?? 8) / 2,
                    padding: "3%",
                    fontSize: "clamp(7px, 0.95vw, 12px)",
                    color: colors.secondary,
                    lineHeight: 1.45,
                  }}
                >
                  Colonne {n} — surfaces dérivées de la charte.
                </div>
              ))}
            </div>
          )}

          {layout === "two-column" && (
            <h2
              style={{
                fontFamily: fonts.heading,
                fontSize: "clamp(12px, 2vw, 22px)",
                color: colors.foreground,
                marginBottom: "3%",
                fontWeight: 700,
              }}
            >
              Deux colonnes
            </h2>
          )}
        </div>
      </div>

      {/* Diagnostics de contraste : visibles, jamais bloquants */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>
          Contraste texte/fond :{" "}
          <strong className={lowContrast ? "text-amber-600" : "text-emerald-600"}>
            {textContrast.toFixed(1)}:1
          </strong>
          {lowContrast && " — sous le seuil WCAG AA (4.5:1)"}
        </span>
        {template.slideTheme === "brand" ? (
          <span>Décor « Marque » activé</span>
        ) : (
          <span>Rendu classique</span>
        )}
      </div>
    </div>
  );
}

/** Position du logo dans l'aperçu, cohérente avec `BrandLogo`. */
function logoBoxStyle(
  placement: TemplateLogoPlacement,
  maxHeight: number
): React.CSSProperties {
  const heightPct = Math.max(2, Math.min(20, maxHeight)) / 2.2;
  const height = `${heightPct}%`;
  const width = `${heightPct * 2.2}%`;
  switch (placement) {
    case "header-right":
      return { top: "2.2%", right: "4%", width, height };
    case "title":
      return { bottom: "8%", left: "4%", width, height };
    case "footer-left":
      return { bottom: "2.4%", left: "4%", width, height };
    case "footer-right":
      return { bottom: "2.4%", right: "4%", width, height };
    case "header-left":
    default:
      return { top: "2.2%", left: "4%", width, height };
  }
}

export { SAMPLE_LAYOUTS };
export type { SampleLayout };
