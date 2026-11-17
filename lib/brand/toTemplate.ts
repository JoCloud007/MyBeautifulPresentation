/**
 * Mapping `BrandTokens` → `Template`.
 *
 * Le principe : on ne réinvente pas une mise en page. On part d'un **archétype**
 * du catalogue existant (structure de `defaultSlides`, espacements, arrondis,
 * ombres) et on remplace toute la couche identitaire (couleurs, polices, logo,
 * pictogrammes). Le résultat est un template parfaitement ordinaire pour le
 * moteur de rendu et les exports — rien de spécial-casé.
 */

import { Template, TemplateBrandInfo, TemplateId } from "@/app/types/template";
// Module de données pures, pas le store : `toTemplate` est appelé depuis l'API
// serveur et le CLI, où un module Zustand ne doit jamais entrer.
import { builtInTemplates } from "@/lib/templates/builtin";
import { relativeLuminance } from "@/lib/brand/normalizeColor";
import { BrandSource, BrandTokens } from "@/lib/brand/types";

export type BrandArchetype = Extract<
  TemplateId,
  "corporate" | "tech" | "minimal" | "startup" | "academic" | "creative" | "dark-luxury" | "editorial" | "dark-tech" | "bold"
>;

export interface BrandToTemplateOptions {
  /** Nom affiché dans le sélecteur — nom du client le plus souvent. */
  name: string;
  /** Archétype de mise en page à emprunter. `corporate` par défaut. */
  archetype?: BrandArchetype;
  /** Couleur d'accent choisie manuellement dans le wizard (prime sur l'inférence). */
  accentOverride?: string;
  /** Logo retenu dans le wizard. */
  logo?: Template["logo"];
  /** Icônes retenues (déjà sanitizées). */
  icons?: Array<{ name: string; svg: string }>;
  /** Identifiant fixe (utile pour un seed déterministe en CI/déploiement). */
  id?: string;
  /** Nom de la source lue (« brand.css », « charte.pptx »). */
  sourceName?: string;
}

/**
 * Choisit un archétype automatiquement selon l'ambiance de la charte.
 * Une charte sombre et technique n'a pas la même structure qu'une charte papier.
 */
export function suggestArchetype(brand: BrandTokens): BrandArchetype {
  const bg = brand.colors.background?.value ?? "#ffffff";
  const isDark = relativeLuminance(bg) < 0.25;
  const heading = brand.fonts.heading?.value?.toLowerCase() ?? "";
  const serif = /serif|georgia|garamond|playfair|merriweather|lora|times|cambria|baskerville|cormorant|libre/i.test(
    heading
  );

  if (isDark) return serif ? "dark-luxury" : "dark-tech";
  if (serif) return "editorial";
  return "corporate";
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "brand";
}

/** Identifiant stable et lisible : `brand-acme-1a2b3c`. */
export function brandTemplateId(name: string): string {
  const suffix = Math.random().toString(16).slice(2, 8);
  return `brand-${slugify(name)}-${suffix}`;
}

/**
 * Construit le `Template` final.
 *
 * Les valeurs absentes de `brand` retombent sur l'archétype : un template
 * partiel reste utilisable, ce qui compte quand un client ne fournit que trois
 * couleurs.
 */
export function brandToTemplate(
  brand: BrandTokens,
  options: BrandToTemplateOptions
): Template {
  const archetypeId = options.archetype ?? suggestArchetype(brand);
  const archetype = builtInTemplates[archetypeId] ?? builtInTemplates.corporate;

  const color = (role: keyof BrandTokens["colors"], fallback: string): string =>
    brand.colors[role]?.value ?? fallback;

  const background = color("background", archetype.colors.background);
  const foreground = color("foreground", archetype.colors.foreground);

  /*
   * `TemplateColor` expose 6 emplacements, la charte en décrit 7 : `primary` et
   * `accent` se disputent donc le champ `accent`, seul slot « couleur
   * d'identité » réellement rendu (filets, graphiques, décor).
   *
   * Arbitrage : c'est la couleur PRIMAIRE qui l'emporte, parce que c'est la
   * couleur que le client reconnaît comme sienne ; un accent secondaire ne
   * remplacerait pas l'identité. Sur une charte sombre où le primaire n'existe
   * pas, l'inférence a déjà replié `primary` sur `accent`, donc rien ne change.
   * Le choix est visible et réversible dans le wizard (accentOverride).
   */
  const accent =
    options.accentOverride ??
    color("primary", color("accent", archetype.colors.accent));

  const heading = brand.fonts.heading?.value;
  const body = brand.fonts.body?.value;

  // La chaîne de repli garantit un rendu correct même si la webfont ne charge
  // pas (poste hors ligne, licence manquante) : jamais de `font-family: Acme`.
  const headingStack = heading
    ? `${quoteIfNeeded(heading)}, ${archetype.fonts.heading}`
    : archetype.fonts.heading;
  const bodyStack = body
    ? `${quoteIfNeeded(body)}, ${archetype.fonts.body}`
    : archetype.fonts.body;

  const isDark = relativeLuminance(background) < 0.25;

  const confidence: Record<string, number> = {};
  for (const [role, token] of Object.entries(brand.colors)) {
    if (token) confidence[role] = token.confidence;
  }
  if (brand.fonts.heading) confidence.headingFont = brand.fonts.heading.confidence;
  if (brand.fonts.body) confidence.bodyFont = brand.fonts.body.confidence;

  const warnings = [...brand.warnings];
  if (brand.logos.length > 1 && !options.logo) {
    warnings.push(
      `${brand.logos.length} images candidates : choisissez le logo à l'étape suivante.`
    );
  }

  // Fidélité : une charte qui distingue primaire et accent ne peut en garder
  // qu'un seul (voir l'arbitrage ci-dessus). On le dit, plutôt que de laisser
  // l'utilisateur découvrir que l'accent du client a disparu.
  const brandHasTwoIdentityColors =
    !options.accentOverride &&
    brand.colors.primary?.value &&
    brand.colors.accent?.value &&
    brand.colors.primary.value !== brand.colors.accent.value;
  if (brandHasTwoIdentityColors) {
    warnings.push(
      `La charte distingue une couleur primaire (${brand.colors.primary!.value}) et un accent ` +
        `(${brand.colors.accent!.value}). Le template utilise le primaire comme couleur d'identité ; ` +
        `pour afficher l'accent à la place, choisissez-le comme couleur d'accent dans le wizard.`
    );
  }

  const template: Template = {
    id: options.id ?? brandTemplateId(options.name),
    name: options.name,
    description: `Charte client — ${brand.sources.map((s) => s.name).join(", ") || options.sourceName || "saisie manuelle"}`,
    category: "brand",

    colors: {
      name: slugify(options.name),
      background,
      foreground,
      accent,
      secondary: color("secondary", archetype.colors.secondary),
      muted: color("muted", archetype.colors.muted),
      border: color("border", archetype.colors.border),
    },

    fonts: { heading: headingStack, body: bodyStack },
    fontSizes: archetype.fontSizes ?? { heading: 48, body: 18 },

    // Le fond suit la charte : à plat si elle est unie, en dégradé si
    // l'archétype en utilisait un ET que la charte est sombre (un dégradé sur
    // fond clair vire au gris sale à l'export).
    background:
      archetype.background?.type === "gradient" && isDark
        ? {
            type: "gradient",
            gradient: {
              direction: archetype.background.gradient?.direction ?? "145deg",
              stops: [
                { color: background, position: 0 },
                { color: color("muted", background), position: 100 },
              ],
            },
            opacity: 100,
          }
        : { type: "color", color: background, opacity: 100 },

    header: archetype.header ?? { text: "", enabled: false, showDate: false },
    footer: archetype.footer ?? {
      text: "",
      enabled: false,
      showPageNumber: false,
      showDate: false,
    },
    spacing: archetype.spacing,
    borderRadius: archetype.borderRadius,
    shadows: archetype.shadows,
    defaultSlides: archetype.defaultSlides.map((s) => ({ ...s })),
    slideTheme: brandThemeIsWorthIt(isDark, accent) ? "brand" : archetype.slideTheme,

    logo: options.logo,
    iconSet: options.icons?.length
      ? {
          style: "line",
          colorRole: "accent",
          icons: options.icons,
        }
      : undefined,

    fontSources: brand.fonts.faces
      .filter((f): f is typeof f & { url: string } => Boolean(f.url && f.family))
      .map((f) => ({
        family: f.family,
        url: f.url,
        weight: f.weight,
        style: f.style,
      })),

    brand: {
      // `BrandSource` inclut `derived` (valeur calculée, pas lue) : la provenance
      // d'un template ne décrit que les fichiers réellement ingérés.
      source:
        brand.sources.length > 1
          ? "mixed"
          : ingestedSource(brand.sources[0]?.kind),
      sourceName: brand.sources.map((s) => s.name).join(", ") || options.sourceName || "saisie manuelle",
      importedAt: new Date().toISOString(),
      confidence,
      warnings,
    },
  };

  return template;
}

/**
 * Le décor `"brand"` est un dégradé accentué : il n'a de sens que sur une charte
 * qui a un accent chromatique distinct du fond. Sur une charte neutre il
 * n'apporte rien, on garde le rendu classique.
 */
function brandThemeIsWorthIt(isDark: boolean, accent: string): boolean {
  if (!isDark) return false;
  const lum = relativeLuminance(accent);
  return lum > 0.25; // un accent clair ressort sur fond sombre
}

/**
 * Ramène une provenance de token à une provenance de charte.
 * `derived` n'est pas un fichier : on retombe sur `manual` (valeur calculée ou
 * saisie), ce qui reste exact du point de vue de l'utilisateur.
 */
function ingestedSource(kind: BrandSource | undefined): TemplateBrandInfo["source"] {
  if (kind === "css" || kind === "pptx" || kind === "pdf" || kind === "manual") {
    return kind;
  }
  return "manual";
}

/** `Acme Sans` → `"Acme Sans"` ; `Inter` reste `Inter`. */
function quoteIfNeeded(family: string): string {
  return /\s/.test(family) && !family.startsWith('"') && !family.startsWith("'")
    ? `'${family}'`
    : family;
}
