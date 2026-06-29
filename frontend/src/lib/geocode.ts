export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string> {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse
?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: {
          // nominatim requires a user-agent
          "User-Agent": "AstroWatch/1.0",
        },
      },
    );

    const data = await resp.json();
    const city =
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      data.address?.amenity ||
      data.address?.quarter ||
      "Unknown";

    const state = data.address?.state_code || data.address?.state || "";
    return state ? `${city}, ${state}` : city;
  } catch {
    return `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°W`;
  }
}
