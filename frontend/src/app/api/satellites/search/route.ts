import { NextResponse } from "next/server";
import type { CelestrakSatellite } from "@/types";

const CATEGORY_GROUPS: Record<string, string> = {
  stations: "stations",
  weather: "weather",
  science: "science",
  gps: "gps-ops",
  starlink: "starlink",
  amateur: "amateur",
};

const CATEGORY_LABELS: Record<string, string> = {
  stations: "Space station",
  weather: "Weather",
  science: "Science",
  gps: "GPS",
  starlink: "Starlink",
  amateur: "Amateur radio",
};

// JSON response shape from Celestrak GP API
interface CelestrakGPRecord {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number;
  OBJECT_TYPE?: string;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.toLowerCase() ?? "";
  const category = searchParams.get("category") ?? "stations";

  const group = CATEGORY_GROUPS[category];
  if (!group) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  try {
    const url =
      `https://celestrak.org/NORAD/elements/gp.php` +
      `?GROUP=${group}&FORMAT=JSON`;

    const res = await fetch(url, {
      next: { revalidate: 3600 }, // cache 1 hour
      headers: {
        "User-Agent": "AstroWatch/1.0",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Celestrak returned ${res.status}`);
    }

    const data = (await res.json()) as CelestrakGPRecord[];

    const satellites: CelestrakSatellite[] = data.map((rec) => ({
      noradId: rec.NORAD_CAT_ID,
      satName: rec.OBJECT_NAME,
      category: CATEGORY_LABELS[category] ?? category,
    }));

    const filtered = query
      ? satellites.filter(
          (s) =>
            s.satName.toLowerCase().includes(query) ||
            s.noradId.toString().includes(query),
        )
      : satellites;

    // return max 50 results
    return NextResponse.json(filtered.slice(0, 50));
  } catch (err) {
    console.error("Celestrak error:", err);
    return NextResponse.json(
      { error: "Failed to fetch satellites" },
      { status: 500 },
    );
  }
}
