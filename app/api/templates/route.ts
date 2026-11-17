import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { importTemplateFromJson } from "@/lib/templateImport";
import { Template } from "@/app/types/template";

/**
 * Lecture/écriture des templates persistés.
 *
 * Évolution : la table porte désormais `payload` (Template v2 complet) en plus
 * des colonnes `colors`/`fonts`/`layouts`. Pour rester rétro-compatible avec les
 * lignes existantes (créées avant `payload`), la lecture reconstruit un
 * template depuis la projection SQL quand `payload` est absent.
 */

/** Reconstruit un Template exploitable depuis une ligne partielle. */
function rowToTemplate(row: {
  id: string;
  name: string;
  description: string | null;
  source: string;
  colors: unknown;
  fonts: unknown;
  layouts: unknown;
  payload: unknown;
}): Template | null {
  // Cas nominal : le payload complet a été écrit par le wizard ou le CLI.
  if (row.payload && typeof row.payload === "object") {
    try {
      return importTemplateFromJson({ version: "2.0", template: row.payload });
    } catch {
      // Payload corrompu : on retombe sur la projection plutôt que de 500.
    }
  }

  const colors = (row.colors ?? {}) as Record<string, unknown>;
  const fonts = (row.fonts ?? {}) as Record<string, unknown>;
  const layouts = (row.layouts ?? {}) as { defaultSlides?: unknown };

  try {
    return importTemplateFromJson({
      version: "2.0",
      template: {
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        category: "brand",
        colors: {
          name: row.name,
          background: colors.background ?? "#ffffff",
          foreground: colors.foreground ?? colors.text ?? "#111827",
          accent: colors.accent ?? colors.primary ?? "#1e40af",
          secondary: colors.secondary ?? "#64748b",
          muted: colors.muted ?? "#f1f5f9",
          border: colors.border ?? "#e2e8f0",
        },
        fonts: {
          heading: fonts.heading ?? "Geist, system-ui, sans-serif",
          body: fonts.body ?? "Geist, system-ui, sans-serif",
        },
        defaultSlides: Array.isArray(layouts.defaultSlides)
          ? layouts.defaultSlides
          : [{ layout: "title" }, { layout: "title-content" }],
      },
    });
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const rows = await prisma.template.findMany({
      orderBy: { createdAt: "desc" },
    });

    // `template` est le Template v2 utilisable tel quel par le rendu ;
    // les colonnes d'origine sont conservées pour les consommateurs existants.
    const templates = rows.map((row) => ({
      ...row,
      template: rowToTemplate(row),
    }));

    return NextResponse.json(templates);
  } catch (error) {
    console.error("Error fetching templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, source, colors, fonts, layouts, isBuiltIn } = body;

    // Un template complet peut être fourni : on le valide avant de persister,
    // pour ne jamais stocker un payload que le rendu ne saurait pas lire.
    let payload: Template | null = null;
    if (body.template) {
      try {
        payload = importTemplateFromJson({ version: "2.0", template: body.template });
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? `Template invalide : ${error.message}`
                : "Template invalide.",
          },
          { status: 400 }
        );
      }
    } else if (body.version && body.template) {
      try {
        payload = importTemplateFromJson(body);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Template invalide." },
          { status: 400 }
        );
      }
    }

    const template = await prisma.template.create({
      data: {
        // L'id fourni (ex. `brand-acme-1a2b3c`) est conservé : il sert de
        // référence stable au logo dans `public/brand/<id>/`.
        ...(typeof body.id === "string" && body.id ? { id: body.id } : {}),
        name: payload?.name ?? name ?? "Untitled Template",
        description: payload?.description ?? description ?? null,
        source: source ?? "json",
        colors: payload?.colors ?? colors ?? {},
        fonts: payload?.fonts ?? fonts ?? {},
        layouts: payload
          ? { defaultSlides: payload.defaultSlides }
          : layouts ?? {},
        isBuiltIn: isBuiltIn ?? false,
        // `Template` est une interface : Prisma attend un `InputJsonObject`.
        // Le contenu a déjà été validé par `importTemplateFromJson`, donc le
        // cast décrit la même garantie au niveau du type.
        payload: (payload ?? undefined) as Prisma.InputJsonValue | undefined,
        brand: (payload?.brand ?? body.brand ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        logo: (payload?.logo ?? body.logo ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Error creating template:", error);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}
