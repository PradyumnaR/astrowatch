import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  try {
    const { userId, getToken } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = await getToken();
    console.log("Token exists:", !!token, "length:", token?.length);

    const body = await req.json();
    const { messages, location, selectedPass } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    // call FastAPI backend
    const response = await fetch(`${BACKEND_URL}/agents/chat/v2/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages,
        location,
        selectedPass,
      }),
    });

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
    const fallbackEvent = {
      type: "final",
      content:
        "I'm having trouble connecting to the AI backend. " +
        "Please make sure the backend server is running and try again.",
      toolsUsed: [],
      sources: [],
    };

    return new Response(`data: ${JSON.stringify(fallbackEvent)}\n\n`, {
      status: 500,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
}
