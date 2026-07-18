import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { messages, location, selectedPass } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    // call FastAPI backend
    const response = await fetch(`${BACKEND_URL}/agents/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        location,
        selectedPass,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("FastAPI error:", error);
      throw new Error(error.detail ?? "Backend request failed");
    }

    const data = await response.json();

    return NextResponse.json({
      content: data.content,
      toolsUsed: data.toolsUsed ?? [],
      sources: data.sources ?? [],
    });
  } catch (err) {
    console.error("Chat route error:", err);

    // fallback message if backend is down
    return NextResponse.json(
      {
        content:
          "I'm having trouble connecting to the AI backend. " +
          "Please make sure the backend server is running " +
          "and try again.",
        toolsUsed: [],
        sources: [],
      },
      { status: 200 }, // return 200 so ChatPanel shows message
    );
  }
}
