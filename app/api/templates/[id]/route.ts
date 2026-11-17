import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { importTemplateFromJson } from "@/lib/templateImport";
import { Template } from "@/app/types/template";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const template = await prisma.template.findUnique({ where: { id } });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error("Error fetching template:", error);
    return NextResponse.json(
      { error: "Failed to fetch template" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, colors, fonts, layouts } = body;

    // Un payload complet (édition d'un template de marque) est validé avant
    // écriture : la projection SQL est recalculée depuis lui, jamais l'inverse.
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
    }

    const template = await prisma.template.update({
      where: { id },
      data: {
        name: payload?.name ?? (name ?? undefined),
        description:
          payload?.description ??
          (description !== undefined ? description : undefined),
        colors: payload?.colors ?? (colors || undefined),
        fonts: payload?.fonts ?? (fonts || undefined),
        layouts: payload
          ? { defaultSlides: payload.defaultSlides }
          : layouts || undefined,
        // Validé par `importTemplateFromJson` plus haut ; le cast aligne le type
        // sur `InputJsonObject` (une interface n'a pas d'index signature).
        payload: (payload ?? undefined) as Prisma.InputJsonValue | undefined,
        brand: (payload?.brand ?? body.brand ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        logo: (payload?.logo ?? body.logo ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error("Error updating template:", error);
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.template.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting template:", error);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
