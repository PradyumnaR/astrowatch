import { NextResponse } from "next/server";

interface OpenMeteoResponse {
  hourly: {
    time: string[];
    cloud_cover: number[];
    temperature_2m: number[];
    wind_speed_10m: number[];
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const timezone = searchParams.get("timezone");

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat, lng required" }, { status: 400 });
  }

  try {
    const url = [
      "https://api.open-meteo.com/v1/forecast",
      `?latitude=${lat}&longitude=${lng}`,
      "&hourly=temperature_2m,cloud_cover,wind_speed_10m",
      "&temperature_unit=fahrenheit",
      "&wind_speed_unit=mph",
      "&forecast_days=3",
      `&timezone=${timezone}`,
    ].join("");

    const res = await fetch(url);

    console.log(url);

    const data = (await res.json()) as OpenMeteoResponse;
    return NextResponse.json({
      hourly: {
        time: data.hourly.time,
        cloudCover: data.hourly.cloud_cover,
        temperature: data.hourly.temperature_2m,
        windSpeed: data.hourly.wind_speed_10m,
      },
    });
  } catch (err) {
    console.error("Weather error:", err);
    return NextResponse.json(
      { error: "Weather fetch failed" },
      { status: 500 },
    );
  }
}
