import { NextResponse } from "next/server";

// N2YO hard-caps a single /positions request to 300 seconds of samples —
// clamp server-side so a bad client value can't cause an oversized/erroring
// upstream request.
const MAX_SECONDS = 300;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const alt = searchParams.get("alt") ?? "0";
  const requestedSeconds = Number(searchParams.get("seconds"));
  const seconds = Math.min(
    Math.max(1, requestedSeconds || MAX_SECONDS),
    MAX_SECONDS,
  );

  if (!id || !lat || !lng) {
    return NextResponse.json(
      { error: "id, lat, lng are required!" },
      { status: 400 },
    );
  }

  try {
    const url = [
      `https://api.n2yo.com/rest/v1/satellite`,
      `/positions/${id}/${lat}/${lng}/${alt}/${seconds}`,
      `/&apiKey=${process.env.N2YO_API_KEY}`,
    ].join("");

    // per-second position data — never cache, unlike /api/passes
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    return NextResponse.json({
      satid: data.info?.satid ?? Number(id),
      satname: data.info?.satname,
      positions: data.positions ?? [],
    });
  } catch (err) {
    console.error("N2YO positions error:", err);
    return NextResponse.json({ positions: [] }, { status: 500 });
  }
}
