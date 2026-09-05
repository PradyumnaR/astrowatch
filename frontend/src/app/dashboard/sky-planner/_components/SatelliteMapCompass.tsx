"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useAstroStore } from "@/stores/astrowatch";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { useLiveSatelliteTracking } from "@/hooks/useLiveSatelliteTracking";
import { azToCompass } from "@/lib/compass";
import CompassArrow from "./CompassArrow";
import type { Location, SatellitePass, SatellitePosition } from "@/types";

// Free, no-API-key vector basemap — see https://openfreemap.org.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

function closestByTimestamp(
  positions: SatellitePosition[],
  target: number,
): SatellitePosition | undefined {
  return positions.reduce<SatellitePosition | undefined>((closest, p) => {
    if (!closest) return p;
    return Math.abs(p.timestamp - target) < Math.abs(closest.timestamp - target)
      ? p
      : closest;
  }, undefined);
}

// Creates a small marker the first time it's called for a given ref, then
// just repositions it on every subsequent call — avoids piling up duplicate
// DOM markers as this runs on every position update.
function upsertPointMarker(
  ref: { current: maplibregl.Marker | null },
  map: maplibregl.Map,
  position: SatellitePosition,
  label: string,
  dotClassName: string,
) {
  const lngLat: [number, number] = [position.satlongitude, position.satlatitude];
  if (ref.current) {
    ref.current.setLngLat(lngLat);
    return;
  }
  const el = document.createElement("div");
  el.className = dotClassName;
  ref.current = new maplibregl.Marker({ element: el })
    .setLngLat(lngLat)
    .setPopup(new maplibregl.Popup({ closeButton: false }).setText(label))
    .addTo(map);
}

// Ground-track map for the active pass: observer marker, live satellite
// marker, and the full rise → max elevation → set trajectory (not just the
// trail behind the satellite). Only mounted while a pass is active, so the
// (relatively expensive) map init/teardown is tied to this component's own
// mount/unmount rather than running on every render.
function LiveMap({
  location,
  selectedPass,
  positions,
  current,
}: {
  location: Location;
  selectedPass: SatellitePass;
  positions: SatellitePosition[] | null;
  current: SatellitePosition | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const satMarkerRef = useRef<maplibregl.Marker | null>(null);
  const riseMarkerRef = useRef<maplibregl.Marker | null>(null);
  const setMarkerRef = useRef<maplibregl.Marker | null>(null);
  const peakMarkerRef = useRef<maplibregl.Marker | null>(null);
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
      riseMarkerRef.current = null;
      setMarkerRef.current = null;
      peakMarkerRef.current = null;
      hasFitRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move the satellite marker + (re)draw the full rise → set trajectory as
  // new positions arrive, imperatively — never recreates the map or marker.
  useEffect(() => {
    const map = mapRef.current;
    const marker = satMarkerRef.current;
    if (!map || !marker || !current) return;

    marker.setLngLat([current.satlongitude, current.satlatitude]);

    // Trim to the pass's actual visible window — the fetched batch can
    // include some samples just before rise or after set (N2YO's positions
    // endpoint returns a fixed window from "now", not clipped to the pass),
    // which are real orbit points but not part of "rise to fall".
    const visible = (positions ?? []).filter(
      (p) =>
        p.timestamp >= selectedPass.startUTC &&
        p.timestamp <= selectedPass.endUTC,
    );

    const source = map.getSource("ground-track") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (source && visible.length) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: visible.map((p) => [p.satlongitude, p.satlatitude]),
        },
      });
    }

    if (visible.length) {
      upsertPointMarker(
        riseMarkerRef,
        map,
        visible[0],
        "Rise",
        "w-2.5 h-2.5 rounded-full bg-aw-bg border-2 border-aw-teal",
      );
      upsertPointMarker(
        setMarkerRef,
        map,
        visible[visible.length - 1],
        "Set",
        "w-2.5 h-2.5 rounded-full bg-aw-bg border-2 border-aw-amber",
      );
      const peak = closestByTimestamp(visible, selectedPass.maxUTC);
      if (peak) {
        upsertPointMarker(
          peakMarkerRef,
          map,
          peak,
          "Max elevation",
          "w-3 h-3 rounded-full bg-aw-purple border-2 border-white shadow-md",
        );
      }
    }

    // Fit the view to the whole visible trajectory (or just observer +
    // satellite if positions haven't loaded yet) once, the first time we
    // have a live fix — after that, leave the user's pan/zoom alone.
    if (!hasFitRef.current && map.isStyleLoaded()) {
      hasFitRef.current = true;
      const bounds = new maplibregl.LngLatBounds(
        [location.lng, location.lat],
        [location.lng, location.lat],
      );
      if (visible.length) {
        visible.forEach((p) => bounds.extend([p.satlongitude, p.satlatitude]));
      } else {
        bounds.extend([current.satlongitude, current.satlatitude]);
      }
      map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 0 });
    }
  }, [current, positions, location, selectedPass]);

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
        <LiveMap
          location={location}
          selectedPass={selectedPass}
          positions={positions}
          current={current}
        />
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
