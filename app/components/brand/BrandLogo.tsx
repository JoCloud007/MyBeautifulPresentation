"use client";

import { Template, TemplateLogo } from "@/app/types/template";

/**
 * Logo de charte, positionné dans une zone réservée de la slide.
 *
 * Contraintes de conception :
 *  - la taille est exprimée en **% de la hauteur de slide**, jamais en pixels :
 *    la slide est rendue en vignette (petite) comme à l'export (grande), et le
 *    logo doit rester proportionné sans calcul de `scale` ;
 *  - chaque placement occupe une zone que le moteur de layout laisse libre, pour
 *    ne jamais recouvrir le contenu ;
 *  - l'image est purement décorative côté accessibilité (`alt` du template).
 */

interface BrandLogoProps {
  logo: TemplateLogo;
  /** Vignette : le logo n'est pas rendu (illisible à cette taille). */
  isMini?: boolean;
}

const PLACEMENT_STYLE: Record<
  TemplateLogo["placement"],
  React.CSSProperties
> = {
  "header-left": {
    top: "2.2%",
    left: "4%",
    height: "auto",
  },
  "header-right": {
    top: "2.2%",
    right: "4%",
    height: "auto",
  },
  title: {
    bottom: "8%",
    left: "4%",
    height: "auto",
  },
  "footer-left": {
    bottom: "2.4%",
    left: "4%",
    height: "auto",
  },
  "footer-right": {
    bottom: "2.4%",
    right: "4%",
    height: "auto",
  },
};

export function BrandLogo({ logo, isMini = false }: BrandLogoProps) {
  if (!logo?.url) return null;

  // En vignette, un logo est illisible et brouille la lecture du layout.
  if (isMini) return null;

  const placement = PLACEMENT_STYLE[logo.placement] ?? PLACEMENT_STYLE["header-left"];
  const heightPct = clampPct(logo.maxHeight) / 2.2; // plafonne à ~9% de la slide
  // La largeur doit être posée explicitement : un wrapper absolu en `width:auto`
  // s'effondre sur la largeur intrinsèque de l'image, et un SVG sans attributs
  // width/height (juste un `viewBox`) se retrouve écrasé à quelques pixels.
  // On reproduit donc exactement la boîte utilisée par l'export PPTX
  // (`logoBoxFor`, ratio 2.2:1) pour que l'aperçu et le fichier livré coïncident.
  const widthPct = heightPct * 2.2;

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        ...placement,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
        opacity: logo.opacity ?? 1,
      }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.url}
        alt={logo.alt ?? ""}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "left center",
          display: "block",
        }}
      />
    </div>
  );
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 8;
  return Math.max(2, Math.min(20, value));
}

/** Le logo de ce template atterrit-il dans l'en-tête ? (pour ajuster le padding) */
export function logoOccupiesHeader(template: Template): boolean {
  const placement = template.logo?.placement;
  return placement === "header-left" || placement === "header-right";
}
