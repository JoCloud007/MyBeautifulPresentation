/**
 * slide-themes — trois directions visuelles haut de gamme pour les slides.
 *
 * Chaque thème est une couche de DÉCOR pur (dégradés, formes, filets, halos)
 * rendue derrière le contenu par `SlideEngine`. Aucun texte n'y est écrit :
 * les blocs de texte restent produits par le moteur de layout à la géométrie
 * de `lib/htmlExport/textZones.ts`, ce qui garantit que l'export PPTX hybride
 * (fond capturé + zones de texte natives) reste aligné.
 *
 * Les couleurs du décor sont volontairement autonomes du `Template.colors`
 * pour que le décor soit identique quel que soit le réglage de l'utilisateur ;
 * seuls les thèmes qui le souhaitent reçoivent un accent du template.
 */

import type { CSSProperties } from "react";
import type { TemplateColor } from "@/app/types/template";

export type SlideThemeId = "editorial" | "dark-tech" | "bold" | "brand";

export interface SlideThemeMeta {
  id: SlideThemeId;
  label: string;
  /** Phrase courte affichée dans le sélecteur de templates. */
  pitch: string;
}

export const SLIDE_THEMES: Record<SlideThemeId, SlideThemeMeta> = {
  editorial: {
    id: "editorial",
    label: "Editorial",
    pitch: "Sobre et papier : typographie serif, filet ambré, respiration.",
  },
  "dark-tech": {
    id: "dark-tech",
    label: "Dark Tech",
    pitch: "Profond et lumineux : halos radiaux, accents néon, ton technique.",
  },
  bold: {
    id: "bold",
    label: "Bold",
    pitch: "Impact visuel : dégradé saturé, cartes glass, chiffres qui parlent.",
  },
  brand: {
    id: "brand",
    label: "Marque",
    pitch: "Décor dérivé de la charte client : dégradé de fond et filet d'accent.",
  },
};

/** Vrai si `value` est un identifiant de thème connu. */
export function isSlideThemeId(value: unknown): value is SlideThemeId {
  // `in` would accept inherited prototype keys ("toString", "__proto__", …),
  // letting an imported template render a bogus theme decor.
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SLIDE_THEMES, value);
}

interface SlideThemeDecorProps {
  themeId: SlideThemeId;
  /** Couleur d'accent du template, utilisée par certains décors. */
  accent?: string;
  /**
   * Palette du template. Seul le thème `"brand"` s'en sert : c'est le seul dont
   * le décor doit varier avec la charte. Les trois thèmes historiques gardent
   * leurs couleurs propres, indépendantes du réglage utilisateur.
   */
  colors?: TemplateColor;
}

/**
 * Rend la couche de décor du thème. Positionnée en absolu derrière le contenu
 * (`pointer-events: none`), elle est capturée comme fond par l'export hybride.
 */
export function SlideThemeDecor({
  themeId,
  accent,
  colors,
}: SlideThemeDecorProps) {
  if (themeId === "brand") {
    /*
     * Décor entièrement dérivé de la charte — c'est le seul thème qui n'a pas
     * de couleurs propres. Il n'ajoute que ce qu'une charte supporte sans
     * trahir : une profondeur de fond (fond → surface) et un filet d'accent.
     * Aucun halo coloré inventé, aucun dégradé saturé.
     */
    const background = colors?.background ?? "#ffffff";
    const surface = colors?.muted ?? background;
    const brandAccent = accent ?? colors?.accent ?? background;

    return (
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        data-slide-theme="brand"
        aria-hidden="true"
        style={{ zIndex: 0 }}
      >
        {/* Profondeur douce : fond → surface, jamais un aplat uniforme. */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(160deg, ${background} 0%, ${surface} 100%)`,
          }}
        />

        {/* Filet d'accent : le seul élément réellement identitaire. */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{ height: "1.1%", background: brandAccent }}
        />

        {/* Rappel discret en bas à droite, comme une signature. */}
        <div
          className="absolute"
          style={{
            bottom: "6%",
            right: "5%",
            width: "8%",
            height: "0.45%",
            minHeight: "1px",
            background: brandAccent,
            opacity: 0.35,
            borderRadius: "999px",
          }}
        />
      </div>
    );
  }

  if (themeId === "editorial") {
    return (
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        data-slide-theme="editorial"
        aria-hidden="true"
        style={{ zIndex: 0 }}
      >
        {/* Filet supérieur ambré */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{ height: "3.2%", background: "#b45309" }}
        />
        {/* Trame papier très légère */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 12% 0%, rgba(180,83,9,0.05) 0%, rgba(180,83,9,0) 55%)",
          }}
        />
        {/* Filet discret en bas à droite */}
        <div
          className="absolute"
          style={{
            bottom: "7%",
            right: "6%",
            width: "9%",
            height: "2px",
            background: "rgba(28,25,23,0.22)",
          }}
        />
      </div>
    );
  }

  if (themeId === "dark-tech") {
    return (
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        data-slide-theme="dark-tech"
        aria-hidden="true"
        style={{
          zIndex: 0,
          background: "linear-gradient(150deg, #0b1020 0%, #131c33 55%, #0a1a2e 100%)",
        }}
      >
        {/* Halo néon en haut à droite */}
        <div
          className="absolute"
          style={{
            width: "46%",
            height: "74%",
            right: "-12%",
            top: "-24%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(94,234,212,0.22) 0%, rgba(94,234,212,0) 68%)",
          }}
        />
        {/* Halo indigo en bas à gauche */}
        <div
          className="absolute"
          style={{
            width: "38%",
            height: "60%",
            left: "-10%",
            bottom: "-20%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(129,140,248,0.20) 0%, rgba(129,140,248,0) 70%)",
          }}
        />
        {/* Grille technique très discrète */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(248,250,252,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(248,250,252,0.035) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:
              "radial-gradient(80% 70% at 50% 40%, #000 0%, rgba(0,0,0,0.25) 70%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(80% 70% at 50% 40%, #000 0%, rgba(0,0,0,0.25) 70%, transparent 100%)",
          }}
        />
        {/* Filet d'accent vertical à gauche */}
        <div
          className="absolute"
          style={{
            left: "3.2%",
            top: "14%",
            width: "3px",
            height: "22%",
            background: `linear-gradient(180deg, ${accent || "#5eead4"} 0%, rgba(94,234,212,0) 100%)`,
            borderRadius: "2px",
          }}
        />
      </div>
    );
  }

  // bold
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      data-slide-theme="bold"
      aria-hidden="true"
      style={{
        zIndex: 0,
        background: "linear-gradient(125deg, #4f46e5 0%, #7c3aed 42%, #db2777 100%)",
      }}
    >
      {/* Lueur douce en haut à gauche */}
      <div
        className="absolute"
        style={{
          width: "55%",
          height: "80%",
          left: "-14%",
          top: "-30%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0) 66%)",
        }}
      />
      {/* Voile sombre en bas pour la lisibilité */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "42%",
          background:
            "linear-gradient(0deg, rgba(24,10,50,0.30) 0%, rgba(24,10,50,0) 100%)",
        }}
      />
    </div>
  );
}

/** Styles de texte réutilisables propres au thème (appliqués au contenu). */
export function slideThemeTextStyle(themeId: SlideThemeId): CSSProperties {
  switch (themeId) {
    case "editorial":
      return { color: "#1c1917" };
    case "dark-tech":
      return { color: "#f8fafc" };
    case "bold":
      return { color: "#ffffff" };
    default:
      // `"brand"` tombe ici volontairement : la couleur de texte vient déjà de
      // `template.colors.foreground`, vérifiée en contraste par
      // `lib/brand/infer.ts`. Forcer une valeur ici la contredirait.
      return {};
  }
}
