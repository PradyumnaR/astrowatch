import { convertToModelMessages, streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { NextResponse } from "next/server";
import type { SatellitePass, Location } from "@/types";
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
  const timezone = location?.timezone ?? "UTC";

  const passCtx = selectedPass
    ? `Selected Pass:
  - - Satellite : ${selectedPass.satname}
- Time      : ${formatPassTime(selectedPass.startUTC, timezone)}
- Max elev. : ${selectedPass.maxEl}°
- Duration  : ${Math.round(selectedPass.duration / 60)} min
- Direction : rises ${selectedPass.startAzCompass}
- Score     : ${selectedPass.viewingScore?.toFixed(1) ?? "N/A"}
- Satellite brightness: ${selectedPass.mag}
- Cloud Cover: ${selectedPass.cloudCover}
- Moon Phase: ${selectedPass.moonPhase}
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
    - Satellite brightness: Scale will be between -4.0 to 6.0. 
      Lower the value more brighter the satellite. Higher the value less brighter to the human eye. 
      If value is 100,000 brightness of the satellite pass is unknow
    
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
