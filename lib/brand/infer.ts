/**
 * Inférence des rôles de charte à partir des candidats bruts.
 *
 * Le cœur du problème : un client livre 30 couleurs, il en faut 7 rôles. La
 * stratégie est entièrement déterministe (aucun LLM requis) et chaque règle se
 * justifie par une propriété mesurable :
 *
 *  - `background` / `foreground` = la paire la plus contrastée et la plus
 *    fréquente (une charte est soit claire, soit sombre ; on ne devine pas).
 *  - `accent` = la couleur la plus SATURÉE parmi les non-neutres pondérées : les
 *    accents sont par définition les couleurs vives que la marque utilise peu
 *    mais partout.
 *  - `primary` = la couleur saturée la plus PONDÉRÉE qui n'est pas déjà accent.
 *  - `secondary` / `muted` / `border` = dérivés du fond par mélange, sauf si un
 *    candidat porte explicitement le rôle.
 *
 * Toute correction (contraste insuffisant, rôle manquant) produit un `warning`
 * visible dans le wizard : l'utilisateur doit savoir ce qui a été décidé pour
 * lui.
 */

import {
  contrastRatio,
  ensureContrast,
  isNeutral,
  mergeSimilarColors,
  mix,
  relativeLuminance,
  saturation,
} from "@/lib/brand/normalizeColor";
import {
  BrandColorCandidate,
  BrandToken,
  BrandTokens,
  emptyBrandTokens,
} from "@/lib/brand/types";

/** Seuil WCAG AA pour du texte normal — le minimum acceptable sur une slide. */
export const MIN_CONTRAST = 4.5;

/** Une charte est « sombre » si son fond est sous cette luminance. */
const DARK_BACKGROUND_LUMINANCE = 0.25;

/** Poids attribués par les libellés explicites, quand un parseur les a fournis. */
const ROLE_LABEL_BONUS = 12;

interface ScoredCandidate extends BrandColorCandidate {
  luminance: number;
  saturation: number;
  neutral: boolean;
}

/**
 * Candidat retenu pour un rôle via son libellé, avec la force de ce libellé.
 * Sert d'arbitre : `--acme-background` (2) bat `--acme-surface` (1).
 */
interface LabelledCandidate extends ScoredCandidate {
  specificity: number;
}

function score(candidate: BrandColorCandidate): ScoredCandidate {
  return {
    ...candidate,
    luminance: relativeLuminance(candidate.hex),
    saturation: saturation(candidate.hex),
    neutral: isNeutral(candidate.hex),
  };
}

/**
 * Devine le rôle qu'un libellé d'évidence désigne, s'il y en a un.
 * Ex. `--color-primary` → `primary` ; « Fond principal » → `background`.
 *
 * @param specificity Set incrémenté avec le nombre de mots-clés reconnus dans le
 *   libellé. Un nom explicite (`--acme-background`) pèse plus qu'un nom
 *   indicateur (`--acme-surface`), sinon un groupe de surfaces fusionnées peut
 *   usurper le rôle de fond — cas réellement observé sur une charte Acme.
 */
function labelledRole(
  candidate: BrandColorCandidate,
  specificity: { value: number }
): string | null {
  const e = candidate.evidence.toLowerCase();

  // `surface` et `muted` désignent la même chose dans une charte (le fond des
  // cartes) : on les traite ensemble AVANT `background`, car `surface` ne doit
  // jamais usurper le fond de page.
  if (/\b(surface|muted|neutre|neutral)\b/.test(e)) {
    specificity.value += 1;
    return "muted";
  }
  if (/\b(background|fond|arriere|bg)\b/.test(e)) {
    specificity.value += 2; // mot exact : plus fiable que `surface`
    return "background";
  }
  if (/\b(accent|highlight|accentuation)\b/.test(e)) {
    specificity.value += 2;
    return "accent";
  }
  if (/\b(primary|primaire|principale|main)\b/.test(e)) {
    specificity.value += 2;
    return "primary";
  }
  if (/\b(secondary|secondaire|complementaire)\b/.test(e)) {
    specificity.value += 2;
    return "secondary";
  }
  if (/\b(foreground|texte|text|ink|encre)\b/.test(e)) {
    specificity.value += 1;
    return "foreground";
  }
  if (/\b(border|bordure|stroke|contour|filet)\b/.test(e)) {
    specificity.value += 1;
    return "border";
  }
  if (/\b(gris|grey|gray)\b/.test(e)) {
    specificity.value += 1;
    return "muted";
  }
  return null;
}

export interface InferOptions {
  /** Nom à donner à la charte ; « Nouvelle charte » par défaut. */
  name?: string;
  /** Famille de titres déjà connue (thème PPTX, @font-face). */
  headingFamily?: { family: string; evidence: string; source?: BrandToken<string>["source"] };
  /** Famille de corps déjà connue. */
  bodyFamily?: { family: string; evidence: string; source?: BrandToken<string>["source"] };
  /** Force le mode clair/sombre au lieu de le déduire. */
  mode?: "light" | "dark";
}

/**
 * Attribue les 7 rôles de couleur et les 2 polices.
 * Retourne toujours un `BrandTokens` complet et cohérent : c'est le contrat avec
 * `brandToTemplate`, qui n'a pas à re-vérifier.
 */
export function inferBrandTokens(
  candidates: BrandColorCandidate[],
  options: InferOptions = {}
): BrandTokens {
  const brand = emptyBrandTokens(options.name ?? "Nouvelle charte");
  const warnings = brand.warnings;

  const merged = mergeSimilarColors(candidates);
  const scored = merged
    .map(score)
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  if (scored.length === 0) {
    warnings.push(
      "Aucune couleur trouvée : la charte a été créée avec une palette neutre. " +
        "Renseignez les couleurs à la main dans l'étape suivante."
    );
    return applyNeutralFallback(brand);
  }

  brand.colorCandidates = scored
    .slice(0, 40)
    .map(({ hex, weight, evidence, source }) => ({ hex, weight, evidence, source }));

  // ---------------------------------------------------------------------
  // 1. Libellés explicites : ils gagnent toujours sur l'heuristique.
  // ---------------------------------------------------------------------
  const byRole = new Map<string, ScoredCandidate>();
  for (const candidate of [...scored].sort((a, b) => b.weight - a.weight)) {
    const specificity = { value: 0 };
    const role = labelledRole(candidate, specificity);
    if (!role) continue;
    const existing = byRole.get(role);
    if (existing && (existing as LabelledCandidate).specificity >= specificity.value) {
      continue;
    }
    byRole.set(role, {
      ...candidate,
      weight: candidate.weight + ROLE_LABEL_BONUS,
      specificity: specificity.value,
    } as LabelledCandidate);
  }

  // ---------------------------------------------------------------------
  // 2. Fond & texte.
  //
  // Priorité : un mode demandé EXPLICITEMENT par l'utilisateur passe avant un
  // libellé de variable. Cas réel : une charte nomme `--acme-background:
  // #ffffff` alors que le client veut une déclinaison sombre ; si on laissait le
  // libellé gagner, le mode « sombre » serait ignoré sans le dire.
  // ---------------------------------------------------------------------
  let background: string | undefined;
  let foreground: string | undefined;

  if (options.mode) {
    const extremes = pickBackgroundAndForeground(scored, options.mode);
    background = extremes.background;
    foreground = extremes.foreground;
    if (extremes.foregroundInvented) {
      warnings.push(
        `Aucune couleur de texte exploitable pour le mode ${options.mode} : « ${extremes.foreground} » a été choisi pour garantir la lisibilité. ` +
          `Renseignez la vraie couleur de texte du client à l'étape suivante.`
      );
    }
    warnings.push(
      `Mode ${options.mode} appliqué comme demandé : le fond de la charte (${byRole.get("background")?.hex ?? "non nommé"}) est ignoré.`
    );
  } else {
    background = byRole.get("background")?.hex;
    foreground = byRole.get("foreground")?.hex;

    if (!background || !foreground) {
      const extremes = pickBackgroundAndForeground(scored, options.mode);
      if (!foreground && extremes.foregroundInvented) {
        warnings.push(
          `Aucune couleur de texte exploitable dans la charte : « ${extremes.foreground} » a été choisi pour garantir la lisibilité. ` +
            `Renseignez la vraie couleur de texte du client à l'étape suivante.`
        );
      }
      background = background ?? extremes.background;
      foreground = foreground ?? extremes.foreground;
    }
  }

  // ---------------------------------------------------------------------
  // 3. Accent : la couleur la plus saturée hors fond/texte.
  // ---------------------------------------------------------------------
  const chromaPool = scored.filter(
    (c) =>
      !c.neutral &&
      c.hex !== background &&
      c.hex !== foreground &&
      Math.abs(c.luminance - relativeLuminance(background!)) > 0.05
  );

  let accent = byRole.get("accent")?.hex;
  if (!accent) {
    const best = [...chromaPool].sort((a, b) => {
      // Saturation dominante, pondération en tie-breaker.
      const sa = a.saturation * 10 + Math.min(a.weight, 20) / 20;
      const sb = b.saturation * 10 + Math.min(b.weight, 20) / 20;
      return sb - sa;
    })[0];
    accent = best?.hex;
  }

  // ---------------------------------------------------------------------
  // 4. Primaire : la couleur de marque la plus utilisée.
  // ---------------------------------------------------------------------
  let primary = byRole.get("primary")?.hex;
  if (!primary) {
    const pool = chromaPool.filter((c) => c.hex !== accent);
    const best = [...pool].sort((a, b) => {
      const wa = a.weight * (0.5 + a.saturation);
      const wb = b.weight * (0.5 + b.saturation);
      return wb - wa;
    })[0];
    primary = best?.hex ?? accent;
  }

  // ---------------------------------------------------------------------
  // 5. Secondaire : une autre couleur chromatique, sinon dérivé du primaire.
  // ---------------------------------------------------------------------
  let secondary = byRole.get("secondary")?.hex;
  if (!secondary) {
    const pool = chromaPool.filter((c) => c.hex !== accent && c.hex !== primary);
    secondary = pool[0]?.hex;
  }

  // ---------------------------------------------------------------------
  // 6. Dérivés : muted (surface) et border.
  // ---------------------------------------------------------------------
  const isDark = relativeLuminance(background) < DARK_BACKGROUND_LUMINANCE;
  let muted = byRole.get("muted")?.hex;
  if (!muted) {
    muted = isNeutral(background)
      ? mix(background, isDark ? "#ffffff" : "#000000", isDark ? 0.08 : 0.04)
      : mix(background, isDark ? "#ffffff" : "#000000", 0.05);
  }
  // Un `muted` doit rester distinct du fond, sinon les cartes disparaissent.
  if (
    muted === background ||
    Math.abs(relativeLuminance(muted) - relativeLuminance(background)) < 0.01
  ) {
    muted = mix(background, isDark ? "#ffffff" : "#000000", 0.09);
  }

  let border = byRole.get("border")?.hex;
  if (!border) {
    border = mix(background, isDark ? "#ffffff" : "#000000", 0.16);
  }

  if (!secondary) {
    secondary = isDark ? mix(foreground, background, 0.35) : mix(foreground, background, 0.3);
  }

  // ---------------------------------------------------------------------
  // 7. Contrastes : une slide illisible n'est pas une charte.
  // ---------------------------------------------------------------------
  const fixedForeground = ensureContrast(foreground, background, MIN_CONTRAST);
  if (fixedForeground !== foreground) {
    warnings.push(
      `Le texte (${foreground}) n'atteint pas le contraste minimum de ${MIN_CONTRAST}:1 sur le fond ` +
        `(${background}, ratio ${contrastRatio(foreground, background).toFixed(2)}:1). ` +
        `Il a été ajusté en ${fixedForeground}.`
    );
    foreground = fixedForeground;
  }

  // L'accent n'est JAMAIS modifié : c'est la couleur d'identité de la marque.
  // L'assombrir pour « améliorer le contraste » produirait une charte infidèle,
  // ce qui est exactement ce qu'on cherche à éviter chez un client. On se
  // contente d'avertir, et c'est le wizard qui propose une variante si le
  // graphiste le souhaite.
  const accentValue = accent ?? primary!;
  const accentContrast = contrastRatio(accentValue, background);
  if (accentContrast < 3) {
    warnings.push(
      `L'accent ${accentValue} ressort peu sur le fond ${background} (ratio ${accentContrast.toFixed(2)}:1). ` +
        `Il est conservé tel quel — utilisez un texte foncé dessus, ou ajustez-le manuellement si besoin.`
    );
  }

  // ---------------------------------------------------------------------
  // 8. Assemblage des tokens avec confiance et évidence.
  // ---------------------------------------------------------------------
  const put = (
    role: keyof BrandTokens["colors"],
    hex: string,
    confidence: number,
    evidence: string,
    source: BrandToken<string>["source"]
  ) => {
    brand.colors[role] = { value: hex, source, confidence, evidence };
  };

  const confidenceFor = (hex: string, labelled: boolean): number => {
    if (labelled) return 0.95;
    const found = scored.find((c) => c.hex === hex);
    if (!found) return 0.5; // valeur dérivée
    const maxWeight = scored[0]?.weight || 1;
    return Math.min(0.9, 0.4 + (found.weight / maxWeight) * 0.5);
  };

  const evidenceFor = (hex: string, fallback: string): string =>
    scored.find((c) => c.hex === hex)?.evidence ?? fallback;

  put(
    "background",
    background,
    confidenceFor(background, byRole.has("background")),
    evidenceFor(background, "couleur la plus adaptée au fond"),
    byRole.has("background") ? "css" : "derived"
  );
  put(
    "foreground",
    foreground,
    confidenceFor(foreground, byRole.has("foreground")),
    evidenceFor(foreground, "couleur de texte déduite du fond"),
    byRole.has("foreground") ? "css" : "derived"
  );
  put(
    "accent",
    accent!,
    confidenceFor(accent!, byRole.has("accent")),
    evidenceFor(accent!, "couleur la plus saturée de la charte"),
    byRole.has("accent") ? "css" : "derived"
  );
  put(
    "primary",
    primary!,
    confidenceFor(primary!, byRole.has("primary")),
    evidenceFor(primary!, "couleur chromatique la plus utilisée"),
    byRole.has("primary") ? "css" : "derived"
  );
  put(
    "secondary",
    secondary!,
    confidenceFor(secondary!, byRole.has("secondary")),
    evidenceFor(secondary!, "seconde couleur chromatique"),
    byRole.has("secondary") ? "css" : "derived"
  );
  put(
    "muted",
    muted,
    byRole.has("muted") ? 0.9 : 0.55,
    evidenceFor(muted, `dérivé de ${background} pour les surfaces`),
    byRole.has("muted") ? "css" : "derived"
  );
  put(
    "border",
    border,
    byRole.has("border") ? 0.9 : 0.5,
    evidenceFor(border, `dérivé de ${background} pour les bordures`),
    byRole.has("border") ? "css" : "derived"
  );

  applyFonts(brand, options, warnings);
  return brand;
}

/**
 * Choisit la paire fond/texte. Sans indication de mode, la charte est jugée
 * « claire » quand ses candidats les plus pondérés sont plutôt clairs — c'est le
 * cas de la grande majorité des chartes d'entreprise.
 */
function pickBackgroundAndForeground(
  scored: ScoredCandidate[],
  mode?: "light" | "dark"
): BackgroundPair {
  const sorted = [...scored].sort((a, b) => b.weight - a.weight);

  if (mode === "dark") {
    // Fond = le plus sombre lourdement pondéré.
    const background = [...sorted].sort((a, b) => a.luminance - b.luminance)[0];
    const foreground =
      [...sorted]
        .filter(
          (c) =>
            c.hex !== background.hex &&
            contrastRatio(c.hex, background.hex) >= MIN_CONTRAST
        )
        .sort((a, b) => b.luminance - a.luminance)[0] ?? null;
    return {
      background: background.hex,
      foreground: foreground?.hex ?? "#ffffff",
      foregroundInvented: !foreground,
    };
  }

  if (mode === "light") {
    return lightPair(sorted);
  }

  // Mode automatique : moyenne pondérée de la luminance des 5 premiers.
  const top = sorted.slice(0, 5);
  const totalWeight = top.reduce((sum, c) => sum + c.weight, 0) || 1;
  const weightedLuminance =
    top.reduce((sum, c) => sum + c.luminance * c.weight, 0) / totalWeight;

  return weightedLuminance < DARK_BACKGROUND_LUMINANCE
    ? pickBackgroundAndForeground(scored, "dark")
    : lightPair(sorted);
}

/** Résultat de la paire fond/texte, avec la raison quand on a dû inventer. */
interface BackgroundPair {
  background: string;
  foreground: string;
  /** Vrai quand aucune couleur de texte exploitable n'existait dans la source. */
  foregroundInvented: boolean;
}

function lightPair(sorted: ScoredCandidate[]): BackgroundPair {
  // Fond = la couleur la plus CLAIRE qui soit aussi l'une des plus pondérées.
  // (`#ffffff` est toujours présent dans une charte mais ne dit rien de la
  // marque ; on privilégie donc la couleur claire la plus lourde.)
  const lightest = [...sorted]
    .filter((c) => c.luminance >= 0.7)
    .sort((a, b) => b.weight - a.weight)[0];
  const background = lightest?.hex ?? "#ffffff";

  const foreground =
    [...sorted]
      .filter(
        (c) =>
          c.hex !== background &&
          contrastRatio(c.hex, background) >= MIN_CONTRAST &&
          c.luminance < 0.5
      )
      .sort((a, b) => b.weight - a.weight)[0];

  return {
    background,
    foreground: foreground?.hex ?? ensureContrast("#111827", background),
    foregroundInvented: !foreground,
  };
}

/** Polices : une famille explicite gagne, sinon la plus pondérée. */
function applyFonts(
  brand: BrandTokens,
  options: InferOptions,
  warnings: string[]
): void {
  if (options.headingFamily) {
    brand.fonts.heading = {
      value: options.headingFamily.family,
      source: options.headingFamily.source ?? "pptx",
      confidence: 0.95,
      evidence: options.headingFamily.evidence,
    };
  }
  if (options.bodyFamily) {
    brand.fonts.body = {
      value: options.bodyFamily.family,
      source: options.bodyFamily.source ?? "pptx",
      confidence: 0.95,
      evidence: options.bodyFamily.evidence,
    };
  }

  if (!brand.fonts.heading && !brand.fonts.body) {
    warnings.push(
      "Aucune police de charte identifiée : le template utilisera la police système. " +
        "Ajoutez les fichiers de police à l'étape suivante si le client en fournit."
    );
  }
}

/** Palette de secours : neutre et lisible, jamais vide. */
function applyNeutralFallback(brand: BrandTokens): BrandTokens {
  const put = (role: keyof BrandTokens["colors"], value: string) => {
    brand.colors[role] = {
      value,
      source: "derived",
      confidence: 0.2,
      evidence: "palette neutre de secours",
    };
  };
  put("background", "#ffffff");
  put("foreground", "#1f2937");
  put("accent", "#2563eb");
  put("primary", "#1e40af");
  put("secondary", "#64748b");
  put("muted", "#f1f5f9");
  put("border", "#e2e8f0");
  applyFonts(brand, {}, brand.warnings);
  return brand;
}

/** Suite de tokens prête à afficher (les rôles absents sont exclus). */
export function resolvedColors(brand: BrandTokens): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, token] of Object.entries(brand.colors)) {
    if (token) out[role] = token.value;
  }
  return out;
}
