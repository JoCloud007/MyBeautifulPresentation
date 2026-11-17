import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const presentations = await prisma.presentation.findMany({
      include: { slides: { orderBy: { order: "asc" } }, template: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(presentations);
  } catch (error) {
    console.error("Error fetching presentations:", error);
    return NextResponse.json(
      { error: "Failed to fetch presentations" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, templateId, slides } = body;

    const presentation = await prisma.presentation.create({
      data: {
        name: name || "Untitled Presentation",
        templateId: templateId || null,
        slides: slides
          ? {
              create: slides.map((slide: unknown, index: number) => ({
                type: (slide as { type?: string }).type || "title",
                title: (slide as { title?: string }).title || null,
                content: (slide as { content?: string }).content || null,
                data: (slide as { data?: unknown }).data ?? null,
                order: index,
                notes: (slide as { notes?: string }).notes || null,
              })),
            }
          : undefined,
      },
      include: { slides: { orderBy: { order: "asc" } }, template: true },
    });

    return NextResponse.json(presentation, { status: 201 });
  } catch (error) {
    console.error("Error creating presentation:", error);
    return NextResponse.json(
      { error: "Failed to create presentation" },
      { status: 500 }
    );
  }
}
