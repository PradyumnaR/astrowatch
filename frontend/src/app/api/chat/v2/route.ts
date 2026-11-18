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

    const token = await getToken();
    console.log("Token exists:", !!token, "length:", token?.length);

    const body = await req.json();
    const { message, location, selectedPass, conversationId } = body;

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }
    if (typeof conversationId !== "string" || !conversationId) {
      return NextResponse.json(
        { error: "conversationId required" },
        { status: 400 },
      );
    }

    // call FastAPI backend
    const response = await fetch(`${BACKEND_URL}/agents/chat/v2/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        location,
        selectedPass,
        conversationId,
      }),
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After") ?? "a few";
      return sseError(
        `You're sending messages quickly. Please wait ${retryAfter} seconds and try again.`,
        429,
      );
    }

    if (!response.ok || !response.body) {
      const errorBody = await response.text();
      console.error(`Backend request failed: ${response.status}`, errorBody);
      throw new Error(`Backend request failed: ${response.status}`);
    }

    // pass the stream straight through — no buffering, no .json()
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat route error:", err);

    // emit a fallback as a single SSE "final" event, so ChatPanel's
    // stream parser handles this the same way as a real stream
    const errorEvent = {
      type: "error",
      message:
        "I'm having trouble connecting to the AI backend. Please try again in a moment.",
    };

    return new Response(`data: ${JSON.stringify(errorEvent)}\n\n`, {
      status: 500,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
}
