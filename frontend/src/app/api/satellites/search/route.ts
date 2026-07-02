import { NextResponse } from "next/server";
import type { CelestrakSatellite } from "@/types";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

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

const CACHE_FRESHNESS_MS = 2 * 60 * 60 * 1000; // 2 hours

async function getCatchedCatalog(
  category: string,
): Promise<{ satellites: CelestrakSatellite[]; fetchedAt: string } | null> {
  const { data, error } = await supabase
    .from("satellite_catalog_cache")
    .select("satellites, fetched_at")
    .eq("category", category)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    satellites: data.satellites as CelestrakSatellite[],
    fetchedAt: data.fetched_at,
  };
}

async function setCachedCatalog(
  category: string,
  satellites: CelestrakSatellite[],
) {
  await supabase.from("satellite_catalog_cache").upsert(
    {
      category,
      satellites,
      fetched_at: new Date().toISOString(),
    },
    {
      onConflict: "category",
    },
  );
}

function isFresh(fetchedAt: string): boolean {
  const age = Date.now() - new Date(fetchedAt).getTime();
  return age < CACHE_FRESHNESS_MS;
}

async function fetchFromCelestrak(
  category: string,
): Promise<CelestrakSatellite[]> {
  const group = CATEGORY_GROUPS[category];
  const url =
    `https://celestrak.org/NORAD/elements/gp.php` +
    `?GROUP=${group}&FORMAT=JSON`;

  const res = await fetch(url, {
    cache: "no-store", // we handle caching ourselves now
    headers: {
      "User-Agent": "AstroWatch/1.0",
      Accept: "application/json",
    },
  });

  if (res.status === 403) {
    const message = await res.text();
    console.warn(`Celestrak 403 for ${group}: ${message}`);
    throw new Error("CELESTRAK_RATE_LIMITED");
  }

  if (!res.ok) {
    throw new Error(`Celestrak returned ${res.status}`);
  }

  const data = (await res.json()) as CelestrakSatellite[];

  return data.map((rec: any) => ({
    noradId: rec.NORAD_CAT_ID,
    satname: rec.OBJECT_NAME,
    category: CATEGORY_LABELS[category] ?? category,
  }));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.toLowerCase() ?? "";
  const category = searchParams.get("category") ?? "stations";

  if (!CATEGORY_GROUPS[category]) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  try {
    let satellites: CelestrakSatellite[];
    const cached = await getCatchedCatalog(category);

    if (cached && isFresh(cached.fetchedAt)) {
      console.log("Fetching satellites from cache", category);
      satellites = cached.satellites;
    } else {
      try {
        console.log("Fetching satellites from Celestrak", category);
        satellites = await fetchFromCelestrak(category);
        // success — update cache for next time
        await setCachedCatalog(category, satellites);
      } catch (fetchErr) {
        // Celestrak failed — fall back to stale cache if we have it
        if (cached) {
          console.warn(
            `Celestrak failed for ${category}, ` +
              `serving stale cache from ${cached.fetchedAt}`,
          );
          satellites = cached.satellites;
        } else {
          // no cache exists at all — nothing to fall back to
          throw fetchErr;
        }
      }
    }

    const filtered = query
      ? satellites.filter(
          (s) =>
            s.satname.toLocaleLowerCase().includes(query) ||
            s.noradId.toString().includes(query),
        )
      : satellites;

    // return 50 results
    return NextResponse.json(filtered.slice(0, 50));
  } catch (err) {
    console.log("Failed to fetch satellites by category", err);
    return NextResponse.json(
      {
        error: err,
        message: "Failed to fetch satellites by category",
      },
      { status: 500 },
    );
  }
}
