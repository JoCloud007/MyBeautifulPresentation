import { NextRequest, NextResponse } from "next/server";
import { analyzeBrand, BrandInputFile } from "@/lib/brand/analyze";
import { BrandParseError } from "@/lib/brand/types";
import { BRAND_LIMITS } from "@/lib/brand/limits";

/**
 * POST /api/brand/analyze
 *
 * Reçoit une charte client (fichiers CSS / PPTX / PDF / SVG / images) et
 * renvoie les tokens normalisés + le template candidat. Le wizard n'a plus qu'à
 * laisser l'utilisateur valider ou corriger.
 *
 * Sécurité :
 *  - `multipart/form-data` uniquement, tailles bornées (`BRAND_LIMITS`) ;
 *  - AUCUN téléchargement d'URL : les `src: url()` du CSS sont conservés comme
 *    chaînes, jamais fetchés (pas d'angle SSRF) ;
 *  - les SVG sont sanitizés par `sanitizeSvg` avant de sortir de la route ;
 *  - le PDF passe par `unpdf` importé dynamiquement, jamais dans le bundle client.
 */

export const runtime = "nodejs";
// `unpdf` charge PDF.js : incompatible avec le runtime edge.
export const maxDuration = 60;

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return badRequest(
      "Format attendu : multipart/form-data avec un ou plusieurs fichiers de charte."
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Corps de requête illisible (multipart invalide).");
  }

  const entries = form.getAll("files");
  const files: BrandInputFile[] = [];
  let totalBytes = 0;

  for (const entry of entries) {
    if (!(entry instanceof File)) continue;
    if (entry.size === 0) {
      return badRequest(`Le fichier ${entry.name} est vide.`);
    }
    if (entry.size > BRAND_LIMITS.maxFileBytes) {
      return badRequest(
        `${entry.name} dépasse la limite de ${(
          BRAND_LIMITS.maxFileBytes /
          1024 /
          1024
        ).toFixed(0)} Mo.`
      );
    }
    totalBytes += entry.size;
    if (totalBytes > BRAND_LIMITS.maxTotalBytes) {
      return badRequest(
        `Total des fichiers supérieur à ${(
          BRAND_LIMITS.maxTotalBytes /
          1024 /
          1024
        ).toFixed(0)} Mo.`
      );
    }

    files.push({
      name: entry.name,
      mimeType: entry.type,
      data: new Uint8Array(await entry.arrayBuffer()),
    });
  }

  if (files.length === 0) {
    return badRequest("Aucun fichier reçu (champ `files` attendu).");
  }

  const nameField = form.get("name");
  const modeField = form.get("mode");
  const name =
    typeof nameField === "string" && nameField.trim()
      ? nameField.trim().slice(0, 120)
      : "Charte client";

  const mode =
    modeField === "light" || modeField === "dark" ? modeField : undefined;

  try {
    const result = await analyzeBrand({ files, name, mode });
    return NextResponse.json({
      name: result.brand.name,
      colors: result.brand.colors,
      colorCandidates: result.brand.colorCandidates,
      fonts: result.brand.fonts,
      logos: result.brand.logos,
      icons: result.brand.icons,
      warnings: result.brand.warnings,
      sources: result.brand.sources,
      perFile: result.perFile,
    });
  } catch (error) {
    if (error instanceof BrandParseError) {
      // Erreur d'entrée utilisateur : 422, pas 500.
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("Brand analysis failed:", error);
    return NextResponse.json(
      { error: "L'analyse de la charte a échoué." },
      { status: 500 }
    );
  }
}
