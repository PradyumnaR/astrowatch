import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const days = searchParams.get("days") ?? "1";

  if (!id || !lat || !lng) {
    return NextResponse.json(
      {
        error: "id, lat, lat are required!",
      },
      { status: 400 },
    );
  }

  try {
    const url = [
      `https://api.n2yo.com/rest/v1/satellite`,
      `/visualpasses/${id}/${lat}/${lng}/0/${days}/30`,
      `/&apiKey=${process.env.N2YO_API_KEY}`,
    ].join("");

    const res = await fetch(url, {
      next: { revalidate: 3600 }, // cache 1hr
    });
    const data = await res.json();

    // N2YO returns HTTP 200 with an `error` field (and no `info`) on
    // failures like an exceeded quota or invalid key — distinguish that
    // from a genuine empty pass list so callers don't mistake "N2YO is
    // erroring" for "no passes tonight".
    if (!res.ok || data?.error || !data?.info) {
      console.error(
        "N2YO passes error:",
        data?.error ?? `HTTP ${res.status}`,
      );
      return NextResponse.json(
        { error: data?.error ?? "Unable to fetch passes from N2YO." },
        { status: 502 },
      );
    }

    const passes = data.passes ?? [];

    // inject satid and satname from info into every pass object
    const passesWithSat = passes.map((p: any) => ({
      ...p,
      satid: data.info.satid, // ← from info
      satname: data.info.satname, // ← from info
    }));

    return NextResponse.json(passesWithSat);
  } catch (err) {
    console.error("N2YO error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
