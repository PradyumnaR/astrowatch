import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function GET(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId required" },
      { status: 400 },
    );
  }

  const token = await getToken();
  const response = await fetch(
    `${BACKEND_URL}/agents/chat/v2/history?conversationId=${encodeURIComponent(conversationId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store", // conversation changes every turn; never cache
    },
  );

  if (!response.ok) {
    console.error(`History request failed: ${response.status}`);
    return NextResponse.json(
      { error: "History unavailable" },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}
