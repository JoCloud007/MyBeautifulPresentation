import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const sessions = await prisma.storySession.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Error fetching story sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch story sessions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, agentProfile, messages, result } = body;

    const session = await prisma.storySession.create({
      data: {
        mode: mode || "interview",
        agentProfile: agentProfile || "consultant",
        messages: messages || [],
        result: result ?? null,
      },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Error creating story session:", error);
    return NextResponse.json(
      { error: "Failed to create story session" },
      { status: 500 }
    );
  }
}
