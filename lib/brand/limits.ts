/**
 * Limites de sécurité partagées par les parseurs de charte.
 *
 * Alignées sur celles de `lib/pptxImport.ts` (protection zip-bomb) : un fichier
 * de charte est un fichier fourni par un tiers, donc il subit les mêmes bornes,
 * plus une borne sur le nombre d'images retenues comme logos.
 */

export const BRAND_LIMITS = {
  /** Taille maximale d'un fichier unitaire (CSS, PPTX, PDF). */
  maxFileBytes: 25 * 1024 * 1024,
  /** Taille cumulée de tous les fichiers d'un même import. */
  maxTotalBytes: 40 * 1024 * 1024,
  /** Nombre d'entrées ZIP (aligné sur pptxImport). */
  maxZipEntries: 1000,
  /** Taille décompressée cumulée. */
  maxUncompressedBytes: 100 * 1024 * 1024,
  /** Ratio de compression max (zip-bomb). */
  maxCompressionRatio: 100,
  /** Nombre d'icônes SVG conservées. */
  maxIcons: 80,
  /** Nombre de logos conservés (les plus gros/génériques d'abord). */
  maxLogos: 8,
  /** Taille max d'un SVG conservé en mémoire. */
  maxSvgBytes: 512 * 1024,
  /** Nb de candidats couleur transmis au wizard. */
  maxColorCandidates: 40,
} as const;

/** Erreur lisible quand une limite est franchie. */
export function limitError(what: string, limit: number, unit = "Mo"): Error {
  const value = unit === "Mo" ? (limit / (1024 * 1024)).toFixed(0) : String(limit);
  return new Error(`${what} dépasse la limite de ${value} ${unit === "Mo" ? "Mo" : unit}.`);
}
