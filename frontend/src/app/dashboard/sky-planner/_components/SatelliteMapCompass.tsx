"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useAstroStore } from "@/stores/astrowatch";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { useLiveSatelliteTracking } from "@/hooks/useLiveSatelliteTracking";
import { azToCompass } from "@/lib/compass";
import CompassArrow from "./CompassArrow";
import type { Location, SatellitePosition } from "@/types";

// Free, no-API-key vector basemap — see https://openfreemap.org.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

// Ground-track map for the active pass: observer marker, live satellite
// marker, and the path accumulated so far. Only mounted while a pass is
// active, so the (relatively expensive) map init/teardown is tied to this
// component's own mount/unmount rather than running on every render.
function LiveMap({
  location,
  positions,
  current,
}: {
  location: Location;
  positions: SatellitePosition[] | null;
  current: SatellitePosition | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const satMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hasFitRef = useRef(false);

  // Create the map once on mount, tear it down on unmount. `location` is
  // only read here for the initial center/observer marker — a pass is
  // tracked from one fixed observer spot, so it never needs to re-init.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [location.lng, location.lat],
      zoom: 9,
      attributionControl: false,
    });
    mapRef.current = map;

    new maplibregl.Marker({ color: "#2dd4bf" })
      .setLngLat([location.lng, location.lat])
      .setPopup(new maplibregl.Popup({ closeButton: false }).setText("You"))
      .addTo(map);

    const satMarkerEl = document.createElement("div");
    satMarkerEl.className =
      "w-3.5 h-3.5 rounded-full bg-aw-purple ring-2 ring-white shadow-md";
    satMarkerRef.current = new maplibregl.Marker({ element: satMarkerEl })
      .setLngLat([location.lng, location.lat])
      .addTo(map);

    map.on("load", () => {
      map.addSource("ground-track", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] },
        },
      });
      map.addLayer({
        id: "ground-track-line",
        type: "line",
        source: "ground-track",
        paint: {
          "line-color": "#7c6ff7",
          "line-width": 2,
          "line-dasharray": [1, 1.5],
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      satMarkerRef.current = null;
      hasFitRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move the satellite marker + extend the ground-track line as new
  // positions arrive, imperatively — never recreates the map or marker.
  useEffect(() => {
    const map = mapRef.current;
    const marker = satMarkerRef.current;
    if (!map || !marker || !current) return;

    marker.setLngLat([current.satlongitude, current.satlatitude]);

    const source = map.getSource("ground-track") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (source) {
      const track = (positions ?? [])
        .filter((p) => p.timestamp <= current.timestamp)
        .map((p) => [p.satlongitude, p.satlatitude]);
      source.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: track },
      });
    }

    // Fit the view to observer + satellite once, the first time we have a
    // live fix — after that, leave the user's pan/zoom alone.
    if (!hasFitRef.current && map.isStyleLoaded()) {
      hasFitRef.current = true;
      const bounds = new maplibregl.LngLatBounds(
        [location.lng, location.lat],
        [location.lng, location.lat],
      );
      bounds.extend([current.satlongitude, current.satlatitude]);
      map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 0 });
    }
  }, [current, positions, location]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      role="img"
      aria-label="Map of your location and the satellite's live ground track"
    />
  );
}

export default function SatelliteMapCompass() {
  const { selectedPass, location } = useAstroStore();
  const { permission, heading, requestAccess } = useDeviceOrientation();
  const {
    phase,
    nowSec,
    positions,
    current,
    liveAz,
    liveEl,
    isEstimating,
    fetchError,
  } = useLiveSatelliteTracking(selectedPass, location);

  if (!selectedPass) {
    return (
      <div className="relative w-full rounded-xl overflow-hidden border border-aw-border bg-aw-bg min-h-[250px] flex items-center justify-center">
        <p className="text-aw-text-muted text-xs">
          Select a pass from the left panel
        </p>
      </div>
    );
  }

  const hasCompass = permission === "granted" && heading !== null;

  if (phase !== "active") {
    return (
      <div className="relative w-full rounded-xl overflow-hidden border border-aw-border bg-aw-bg min-h-[250px] flex flex-col items-center justify-center gap-3 py-7 px-5 text-center">
        <span className="text-[10px] font-semibold tracking-wider uppercase text-aw-text-muted">
          {selectedPass.satname} ·{" "}
          {phase === "upcoming" ? "Next pass" : "Pass ended"}
        </span>

        {phase === "upcoming" && (
          <>
            <div className="text-4xl font-semibold text-aw-purple tabular-nums">
              {formatCountdown(selectedPass.startUTC - nowSec)}
            </div>
            <div className="flex gap-5 text-[12px] text-aw-text-sec tabular-nums">
              <span>
                Rise{" "}
                <b className="text-aw-text font-semibold">
                  {selectedPass.startAzCompass} · {selectedPass.startEl}°
                </b>
              </span>
              <span>
                Peak{" "}
                <b className="text-aw-text font-semibold">
                  {selectedPass.maxEl}°
                </b>
              </span>
              <span>
                Duration{" "}
                <b className="text-aw-text font-semibold">
                  {formatCountdown(selectedPass.duration)}
                </b>
              </span>
            </div>
            <p className="text-aw-text-muted text-[11px] max-w-[260px]">
              Live tracking starts automatically once the pass is within 5
              minutes.
            </p>
          </>
        )}

        {phase === "ended" && (
          <p className="text-aw-text-sec text-[13px]">This pass has ended.</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-[340px] rounded-xl overflow-hidden border border-aw-border bg-aw-bg">
      {location ? (
        <LiveMap location={location} positions={positions} current={current} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-aw-text-muted text-xs">
            Waiting for your location…
          </p>
        </div>
      )}

      <span className="absolute top-2.5 left-2.5 z-10 rounded-md bg-aw-bg/90 backdrop-blur-sm px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-aw-text-muted border border-aw-border">
        {selectedPass.satname} · Active now
      </span>

      <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 rounded-xl border border-aw-border bg-aw-bg/90 backdrop-blur-sm px-4 py-3 shadow-lg max-w-[260px]">
        {permission === "prompt-needed" ? (
          <>
            <button
              onClick={requestAccess}
              className="h-9 px-5 rounded-lg border border-aw-purple/45 bg-aw-purple/15 text-aw-purple text-[13px] font-medium hover:bg-aw-purple/25 transition-colors cursor-pointer"
            >
              Enable compass
            </button>
            <p className="text-aw-text-muted text-[11px] text-center">
              Tap to allow AstroWatch to use your compass for live pointing.
              Android doesn&apos;t need this step.
            </p>
          </>
        ) : (
          <>
            {hasCompass ? (
              <CompassArrow targetAz={liveAz} heading={heading as number} />
            ) : (
              <>
                <div className="text-[26px] font-semibold tabular-nums">
                  {Math.round(liveAz)}° ({azToCompass(liveAz)}),{" "}
                  {Math.round(liveEl)}° up
                </div>
                <p className="text-aw-text-muted text-[11px] text-center">
                  {permission === "denied"
                    ? "Compass access was denied — showing numeric direction instead."
                    : "Compass unavailable — showing numeric direction instead."}
                </p>
              </>
            )}

            <div className="w-full">
              <div className="text-[28px] font-semibold text-aw-purple tabular-nums leading-none text-center">
                {Math.round(liveEl)}°
              </div>
              <div className="text-[11px] text-aw-text-muted mt-0.5 text-center">
                {isEstimating ? "Look up (estimating…)" : "Look up"}
              </div>
              <div className="flex gap-1 mt-2.5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 h-1 rounded-full ${
                      i < Math.round(liveEl / 9)
                        ? "bg-aw-purple"
                        : "bg-aw-tint-hover"
                    }`}
                  />
                ))}
              </div>
            </div>

            {fetchError && (
              <p className="text-aw-amber text-[11px] text-center">
                {fetchError}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
