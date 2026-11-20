import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// An SSE "error" event, which ChatPanel renders as an assistant message
function sseError(message: string, status: number) {
  return new Response(
    `data: ${JSON.stringify({ type: "error", message })}\n\n`,
    { status, headers: { "Content-Type": "text/event-stream" } },
  );
}

export async function POST(req: Request) {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId, choice } = await req.json();
    if (typeof conversationId !== "string" || !conversationId) {
      return NextResponse.json(
        { error: "conversationId required" },
        { status: 400 },
      );
    }
    if (typeof choice !== "string" || !choice) {
      return NextResponse.json({ error: "choice required" }, { status: 400 });
    }

    const token = await getToken();
    const response = await fetch(`${BACKEND_URL}/agents/chat/v2/resume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ conversationId, choice }),
    });

    // The conversation isn't paused anymore (already answered, or a new
    // message was sent since) — the card the user clicked is stale
    if (response.status === 409) {
      return sseError(
        "That confirmation is no longer active. Please ask again.",
        409,
      );
    }

    if (!response.ok || !response.body) {
      console.error(`Resume request failed: ${response.status}`);
      return sseError(
        "I couldn't complete that action. Please try again.",
        502,
      );
    }

    // pass the stream straight through — no buffering
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Resume route error:", err);
    return sseError(
      "I'm having trouble connecting to the AI backend. Please try again in a moment.",
      500,
    );
  }
}
