import { convertToModelMessages, streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { NextResponse } from "next/server";
import type { SatellitePass, Location } from "@/types";
import { formatTime } from "@/lib/formatTime";
import { formatPassTime } from "@/lib/formatPassTime";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildSystemPrompt(
  location: Location | null,
  selectedPass: SatellitePass | null,
): string {
  const locationCtx = location
    ? `${location.name} (${location.lat.toFixed(2)}°N, 
       ${Math.abs(location.lng).toFixed(2)}°W)`
    : "Unknown location";

  const passCtx = selectedPass
    ? `Selected Pass:
  - - Satellite : ${selectedPass.satname}
- Time      : ${formatPassTime(selectedPass.startUTC)}
- Max elev. : ${selectedPass.maxEl}°
- Duration  : ${Math.round(selectedPass.duration / 60)} min
- Direction : rises ${selectedPass.startAzCompass}
- Score     : ${selectedPass.viewingScore?.toFixed(1) ?? "N/A"}
  `
    : "No pass selected";

  return `You are AstroWatch AI, a friendly and knowledgeable
    satellite and astronomy assistant.
    
    You help users track satellites, plan sky observations,
    and learn about space. Keep responses concise and helpful.
    Use plain english — avoid jargon unless the user asks.
    
    Current context:
    - Observer location : ${locationCtx}
    - ${passCtx}
    
    When answering questions about visibility, use the
    viewing score and elevation to give honest advice.
    A score above 8 is excellent. Below 5 is poor.
    Always tell the user which direction to face
    and what time to go outside.`;
}

export async function POST(req: Request) {
  try {
    const { messages, location, selectedPass } = await req.json();

    // create a ReadableStream that pipes Claude tokens
    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      system: buildSystemPrompt(location, selectedPass),
      maxOutputTokens: 1024,
      messages: await convertToModelMessages(messages),
    });
    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error("Chat error:", err);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}
