import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const slides = await prisma.slide.findMany({
      where: { presentationId: id },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(slides);
  } catch (error) {
    console.error("Error fetching slides:", error);
    return NextResponse.json(
      { error: "Failed to fetch slides" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { type, title, content, data, order, notes } = body;

    const slide = await prisma.slide.create({
      data: {
        presentationId: id,
        type: type || "title",
        title: title || null,
        content: content || null,
        data: data ?? null,
        order: order || 0,
        notes: notes || null,
      },
    });

    return NextResponse.json(slide, { status: 201 });
  } catch (error) {
    console.error("Error creating slide:", error);
    return NextResponse.json(
      { error: "Failed to create slide" },
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
    const { slides } = body;

    // Bulk update/replace slides
    if (slides && Array.isArray(slides)) {
      await prisma.$transaction([
        prisma.slide.deleteMany({ where: { presentationId: id } }),
        prisma.slide.createMany({
          data: slides.map((slide: unknown, index: number) => ({
            presentationId: id,
            type: (slide as { type?: string }).type || "title",
            title: (slide as { title?: string }).title || null,
            content: (slide as { content?: string }).content || null,
            data: (slide as { data?: unknown }).data ?? undefined,
            order: index,
            notes: (slide as { notes?: string }).notes || null,
          })),
        }),
      ]);
    }

    const updatedSlides = await prisma.slide.findMany({
      where: { presentationId: id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(updatedSlides);
  } catch (error) {
    console.error("Error updating slides:", error);
    return NextResponse.json(
      { error: "Failed to update slides" },
      { status: 500 }
    );
  }
}
