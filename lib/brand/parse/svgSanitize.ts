/**
 * Sanitisation des SVG de charte avant stockage ou rendu.
 *
 * Un SVG client est un fichier **fourni par un tiers** : il peut contenir du
 * script, des gestionnaires `on*`, des `<foreignObject>` (HTML arbitraire) ou
 * des références externes. On n'exécute jamais ce contenu : on le réduit à des
 * primitives de dessin avant de l'inliner dans le DOM ou de l'écrire sous
 * `public/`.
 *
 * Choix : sanitisation par liste blanche (allowlist) d'éléments et
 * d'attributs, pas par suppression de motifs connus — une denylist se contourne
 * toujours par une variante d'écriture.
 */

/** Éléments autorisés : formes, groupes, texte, dégradés, clip. */
const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "use",
  "symbol",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "pattern",
  "filter",
  "fegaussianblur",
  "fecolormatrix",
  "feoffset",
  "femerge",
  "femergenode",
  "feblend",
  "feflood",
  "fecomposite",
]);

/**
 * Attributs autorisés : géométrie, présentation, dégradés.
 * Tout `on*` est exclu mécaniquement (aucun n'est dans la liste).
 *
 * SVG est sensible à la CASSE sur les attributs camelCase (`viewBox`,
 * `linearGradient`, `preserveAspectRatio`). La liste est donc en camelCase
 * exact, et la vérification se fait en comparant au nom d'origine : passer en
 * minuscules casserait `viewBox` (qui devient un attribut inconnu → logo à
 * l'échelle 1:1 tronqué).
 */
const ALLOWED_ATTRIBUTES = new Set([
  "xmlns",
  "xmlns:xlink",
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "fx",
  "fy",
  "d",
  "points",
  "transform",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "opacity",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "patternUnits",
  "patternContentUnits",
  "clip-path",
  "clip-rule",
  "mask",
  "maskUnits",
  "id",
  "class",
  "style",
  "preserveAspectRatio",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
  "filter",
  "result",
  "in",
  "in2",
  "stdDeviation",
  "pointsAtX",
  "pointsAtY",
  "spreadMethod",
  "xlink:href",
  "href",
  "mode",
  "type",
  "values",
  "operator",
  "k1",
  "k2",
  "k3",
  "k4",
]);

/**
 * Index minuscule → graphie canonique, construit depuis la liste blanche.
 * Permet d'accepter `viewbox` (livré par certains outils) tout en réécrivant
 * toujours `viewBox`, seule graphie comprise du navigateur.
 */
const CANONICAL_ATTRIBUTE_CASE = new Map<string, string>(
  [...ALLOWED_ATTRIBUTES].map((attr) => [attr.toLowerCase(), attr])
);

/** Vrai si une URL/`href` pointe vers l'extérieur ou un protocole actif. */
function isUnsafeReference(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith("#")) return false; // référence interne, sûr
  if (v.startsWith("data:")) {
    // Un data: SVG peut contenir un SVG complet — refusé pour éviter la récursion.
    return true;
  }
  return true; // http(s), javascript:, file:… → refusés
}

/**
 * Retourne un SVG sûr, ou `null` si rien d'exploitable ne subsiste.
 * Ne lève jamais : le wizard traite un `null` comme « icône ignorée ».
 */
export function sanitizeSvg(input: string): string | null {
  if (typeof input !== "string" || !input.trim()) return null;

  // Retire commentaires, doctype et blocs script avant l'analyse.
  let svg = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "");
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  svg = svg.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  svg = svg.replace(/<style[\s\S]*?<\/style>/gi, "");

  const openTagRe = /<\s*(\/?)\s*([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)\s*>/g;
  let dropped = 0;
  const kept: string[] = [];
  let cursor = 0;

  let match: RegExpExecArray | null;
  while ((match = openTagRe.exec(svg)) !== null) {
    const [, closing, rawName, rawAttrs, selfClosing] = match;
    const name = rawName.toLowerCase();

    // Tout ce qui se trouve ENTRE deux balises est du contenu. Il faut le
    // conserver : sans cela un `<text>ACME</text>` devient `<text></text>`, et
    // un logo construit avec du texte (cas très courant chez les clients) perd
    // son nom. Le contenu textuel est échappé, jamais interprété comme balise.
    if (match.index > cursor) {
      const between = svg.slice(cursor, match.index);
      if (between.trim()) kept.push(escapeText(between));
    }
    cursor = openTagRe.lastIndex;

    if (!ALLOWED_ELEMENTS.has(name)) {
      dropped++;
      continue;
    }

    if (closing) {
      // Une balise fermante d'un élément autorisé est conservée telle quelle.
      kept.push(`</${rawName}>`);
      continue;
    }

    const attrs = filterAttributes(rawAttrs);
    kept.push(`<${rawName}${attrs ? " " + attrs : ""}${selfClosing ? "/" : ""}>`);
  }

  // Contenu résiduel après la dernière balise.
  if (cursor < svg.length) {
    const tail = svg.slice(cursor);
    if (tail.trim()) kept.push(escapeText(tail));
  }

  // `dropped` ne sert qu'au diagnostic : un élément refusé est « déballé »
  // (ses enfants autorisés sont conservés), pas retiré avec son sous-arbre.
  void dropped;
  if (kept.length === 0) return null;

  const result = kept.join("");
  // Un SVG sans racine n'a aucun intérêt : on exige le tag racine.
  if (!/<svg[\s>]/i.test(result)) return null;
  return result;
}

function filterAttributes(rawAttrs: string): string {
  const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(rawAttrs)) !== null) {
    // La casse d'origine est conservée : `viewBox` reste `viewBox`. On teste la
    // liste blanche sans transformation, puis on tolère une césure de casse
    // (un client peut livrer `viewbox` — on le réécrit alors correctement).
    const rawName = m[1];
    const canonical = CANONICAL_ATTRIBUTE_CASE.get(rawName.toLowerCase());
    if (!canonical || !ALLOWED_ATTRIBUTES.has(canonical)) continue;

    const name = canonical;
    const value = m[3] ?? m[4] ?? m[5] ?? "";

    if (name === "href" || name === "xlink:href") {
      if (isUnsafeReference(value)) continue;
    }
    if (name === "style") {
      // Un style inline ne peut porter que des déclarations de présentation.
      if (/url\s*\(\s*(?!#)/i.test(value)) continue;
      if (/expression|javascript:|@import/i.test(value)) continue;
    }
    if (/url\s*\(\s*(?!#)/i.test(value) && name !== "style") continue;

    out.push(`${name}="${escapeAttr(value)}"`);
  }
  return out.join(" ");
}

/**
 * Échappe du contenu textuel. On n'essaie pas d'interpréter : tout ce qui n'est
 * pas une balise autorisée est du texte inerte, donc sans danger une fois
 * échappé.
 */
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Extrait `viewBox` et la longueur du contenu — sert à classer les logos. */
export function svgMeta(svg: string): { viewBox?: string; length: number } {
  const vb = svg.match(/viewbox\s*=\s*"([^"]+)"/i);
  return { viewBox: vb?.[1], length: svg.length };
}
