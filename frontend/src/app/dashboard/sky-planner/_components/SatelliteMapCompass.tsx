"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Compass, X } from "lucide-react";
import { useAstroStore } from "@/stores/astrowatch";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import {
  estimatePosition,
  useLiveSatelliteTracking,
} from "@/hooks/useLiveSatelliteTracking";
import { azToCompass } from "@/lib/compass";
import { buildPassTrajectory } from "@/lib/groundTrack";
import CompassArrow from "./CompassArrow";
import type { Location, SatellitePass, SatellitePosition } from "@/types";

// Free, no-API-key vector basemap — see https://openfreemap.org.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Self-host MapLibre's worker script instead of relying on its own
// `new Worker(new URL("./maplibre-gl-worker.mjs", import.meta.url))`
// resolution — that pattern needs bundler-level support to rewrite the URL
// correctly, and in production here it instead resolved to a URL that
// doesn't exist, so the browser got an HTML 404 back for what it expected
// to be a JS module and refused to run it, leaving the map silently blank.
// The file this points at is copied from node_modules by
// scripts/copy-maplibre-worker.mjs (via the postinstall/build scripts).
// Set once at module scope, before any Map (and its worker pool) is ever
// created.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

// Fabricates a short "active right now" pass + a matching synthetic
// position track, entirely client-side — used only by the "Preview map"
// button so the map/compass/trajectory can be exercised on demand without
// any real pass and, crucially, without a single call to /api/positions
// (unlike the old real-data "simulate" button this replaces).
function buildPreviewScenario(location: Location): {
  pass: SatellitePass;
  positions: SatellitePosition[];
} {
  const now = Math.floor(Date.now() / 1000);
  const startUTC = now - 5;
  const maxUTC = now + 55;
  const endUTC = now + 115;
  const startAz = 200;
  const maxAz = 270;
  const endAz = 10;

  const pass: SatellitePass = {
    satid: 0,
    satname: "Preview Satellite",
    startAz,
    startAzCompass: azToCompass(startAz),
    startEl: 10,
    startUTC,
    maxAz,
    maxEl: 60,
    maxUTC,
    endAz,
    endUTC,
    mag: -2,
    duration: endUTC - startUTC,
  };

  const positions: SatellitePosition[] = [];
  for (let t = startUTC; t <= endUTC; t++) {
    const frac = (t - startUTC) / (endUTC - startUTC);
    positions.push({
      ...estimatePosition(pass, t),
      // sweeps a few degrees across the observer's location — not real
      // orbital geometry, just enough to see the map, marker, and
      // trajectory line move.
      satlatitude: location.lat + (frac - 0.5) * 4,
      satlongitude: location.lng + (frac - 0.5) * 6,
      sataltitude: 400,
      timestamp: t,
    });
  }

  return { pass, positions };
}

// Creates a small marker the first time it's called for a given ref, then
// just repositions it on every subsequent call — avoids piling up duplicate
// DOM markers if this is ever called more than once for the same ref.
function upsertPointMarker(
  ref: { current: maplibregl.Marker | null },
  map: maplibregl.Map,
  point: { lat: number; lng: number },
  label: string,
  dotClassName: string,
) {
  const lngLat: [number, number] = [point.lng, point.lat];
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
// marker, and the full rise → max elevation → set trajectory. The
// trajectory is computed once from the pass's own known az/el shape (see
// buildPassTrajectory) rather than from live position samples, so it can
// never change or shrink across a remount (tab switch, page navigation,
// refresh) — only the live marker moves, driven by `current`. Only
// mounted while a pass is active, so the (relatively expensive) map
// init/teardown is tied to this component's own mount/unmount rather than
// running on every render.
function LiveMap({
  location,
  selectedPass,
  current,
}: {
  location: Location;
  selectedPass: SatellitePass;
  current: SatellitePosition | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const satMarkerRef = useRef<maplibregl.Marker | null>(null);
  const riseMarkerRef = useRef<maplibregl.Marker | null>(null);
  const setMarkerRef = useRef<maplibregl.Marker | null>(null);
  const peakMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  // Stable for the component's lifetime — selectedPass/location are
  // Zustand-store values, unaffected by remounts.
  const trajectory = useMemo(
    () => buildPassTrajectory(selectedPass, location),
    [selectedPass, location],
  );

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

    // Surface a style/tile/network failure instead of leaving the map
    // silently blank — this fires for e.g. an unreachable basemap URL.
    map.on("error", (e) => {
      console.error("MapLibre error:", e.error);
      setMapFailed(true);
    });

    new maplibregl.Marker({ color: "#2dd4bf" })
      .setLngLat([location.lng, location.lat])
      .setPopup(new maplibregl.Popup({ closeButton: false }).setText("You"))
      .addTo(map);

    const satMarkerEl = document.createElement("div");
    satMarkerEl.className =
      "w-3.5 h-3.5 rounded-full bg-aw-purple ring-2 ring-white shadow-md";
    satMarkerRef.current = new maplibregl.Marker({ element: satMarkerEl })
      .setLngLat([trajectory[0].lng, trajectory[0].lat])
      .addTo(map);

    map.on("load", () => {
      map.addSource("ground-track", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: trajectory.map((p) => [p.lng, p.lat]),
          },
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

      const peakIndex = (trajectory.length - 1) / 2;
      upsertPointMarker(
        riseMarkerRef,
        map,
        trajectory[0],
        "Start Pass",
        "w-2.5 h-2.5 rounded-full bg-aw-bg border-2 border-aw-teal",
      );
      upsertPointMarker(
        peakMarkerRef,
        map,
        trajectory[peakIndex],
        "Max El",
        "w-3 h-3 rounded-full bg-aw-purple border-2 border-white shadow-md",
      );
      upsertPointMarker(
        setMarkerRef,
        map,
        trajectory[trajectory.length - 1],
        "End Pass",
        "w-2.5 h-2.5 rounded-full bg-aw-bg border-2 border-aw-amber",
      );
    });

    // MapLibre measures its container's size once, synchronously, right
    // here at construction — if that measurement is stale (e.g. the
    // container's flex/absolute layout hasn't fully settled yet on this
    // exact tick), the canvas's internal drawing buffer ends up mismatched
    // with its actual on-screen size: blurry (a small buffer stretched by
    // CSS) and effectively zoomed out relative to the requested `zoom`,
    // until something (like a manual zoom) forces MapLibre to recompute.
    // A ResizeObserver fires once immediately on observe() with the
    // current size, so this also corrects that first stale measurement.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      satMarkerRef.current = null;
      riseMarkerRef.current = null;
      setMarkerRef.current = null;
      peakMarkerRef.current = null;
    };
    // trajectory is intentionally omitted: this effect only ever needs the
    // value trajectory holds at mount time (to seed the live marker/line
    // before "load" fires), and re-running it on trajectory changes would
    // destroy and recreate the whole map for no reason — trajectory only
    // actually changes when selectedPass/location do, which already tears
    // this component down and remounts it with a fresh LiveMap instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only the live dot moves — the static path/markers are set once above
  // and never touched again.
  useEffect(() => {
    const marker = satMarkerRef.current;
    if (!marker || !current) return;
    marker.setLngLat([current.satlongitude, current.satlatitude]);
  }, [current]);

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Map of your location and the satellite's live ground track"
      />
      {mapFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-aw-bg">
          <p className="text-aw-text-muted text-xs px-6 text-center">
            Map failed to load — check your connection.
          </p>
        </div>
      )}
    </>
  );
}

export default function SatelliteMapCompass() {
  const { selectedPass, location } = useAstroStore();
  const { permission, heading, requestAccess } = useDeviceOrientation();
  const [preview, setPreview] = useState<{
    pass: SatellitePass;
    positions: SatellitePosition[];
  } | null>(null);
  const [compassOpen, setCompassOpen] = useState(true);

  // A newly-selected real pass always takes over from an active preview —
  // adjusted during render in response to the prop change (same pattern
  // useLiveSatelliteTracking uses for its own passKey reset) rather than in
  // an effect, so switching passes while previewing doesn't get stuck
  // showing stale synthetic data.
  const selectedPassKey = selectedPass
    ? `${selectedPass.satid}-${selectedPass.startUTC}`
    : null;
  const [prevSelectedPassKey, setPrevSelectedPassKey] =
    useState(selectedPassKey);
  if (selectedPassKey !== prevSelectedPassKey) {
    setPrevSelectedPassKey(selectedPassKey);
    if (preview) setPreview(null);
  }

  // While active, a preview intentionally overrides any real selection —
  // it's an explicit, opt-in choice (the button doubles as an "exit
  // preview" toggle), not just a stand-in for "nothing real selected".
  const isPreviewing = !!preview;
  const effectivePass = preview?.pass ?? selectedPass ?? null;
  const {
    phase,
    nowSec,
    current,
    liveAz,
    liveEl,
    isEstimating,
    fetchError,
  } = useLiveSatelliteTracking(
    effectivePass,
    location,
    isPreviewing ? preview.positions : undefined,
  );

  // Always reachable regardless of whether a real pass happens to be
  // selected — PassList auto-selects the best pass as soon as it loads, so
  // gating this on "nothing selected" would make it unreachable in
  // practice most of the time.
  const previewToggle = location ? (
    <button
      onClick={() =>
        setPreview(isPreviewing ? null : buildPreviewScenario(location))
      }
      className="cursor-pointer text-[11px] text-aw-text-muted hover:text-aw-purple underline decoration-dotted"
      title="Shows the map + compass with synthetic data — no real pass or API calls involved."
    >
      {isPreviewing ? "Exit preview" : "Preview map (test)"}
    </button>
  ) : null;

  if (!effectivePass) {
    return (
      <div className="relative w-full rounded-xl overflow-hidden border border-aw-border bg-aw-bg min-h-[250px] flex flex-col items-center justify-center gap-3">
        <p className="text-aw-text-muted text-xs">
          Select a pass from the left panel
        </p>
        {previewToggle}
      </div>
    );
  }

  const hasCompass = permission === "granted" && heading !== null;

  if (phase !== "active") {
    return (
      <div className="relative w-full rounded-xl overflow-hidden border border-aw-border bg-aw-bg min-h-[250px] flex flex-col items-center justify-center gap-3 py-7 px-5 text-center">
        <span className="text-[10px] font-semibold tracking-wider uppercase text-aw-text-muted">
          {effectivePass.satname} ·{" "}
          {phase === "upcoming" ? "Next pass" : "Pass ended"}
        </span>

        {phase === "upcoming" && (
          <>
            <div className="text-4xl font-semibold text-aw-purple tabular-nums">
              {formatCountdown(effectivePass.startUTC - nowSec)}
            </div>
            <div className="flex gap-5 text-[12px] text-aw-text-sec tabular-nums">
              <span>
                Rise{" "}
                <b className="text-aw-text font-semibold">
                  {effectivePass.startAzCompass} · {effectivePass.startEl}°
                </b>
              </span>
              <span>
                Peak{" "}
                <b className="text-aw-text font-semibold">
                  {effectivePass.maxEl}°
                </b>
              </span>
              <span>
                Duration{" "}
                <b className="text-aw-text font-semibold">
                  {formatCountdown(effectivePass.duration)}
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

        {previewToggle}
      </div>
    );
  }

  return (
    <div className="relative w-full h-[340px] rounded-xl overflow-hidden border border-aw-border bg-aw-bg">
      {location ? (
        <LiveMap
          location={location}
          selectedPass={effectivePass}
          current={current}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-aw-text-muted text-xs">
            Waiting for your location…
          </p>
        </div>
      )}

      <span
        className="absolute top-2.5 left-2.5 z-10 inline-block max-w-[55%] truncate rounded-md bg-aw-bg/90 backdrop-blur-sm px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-aw-text-muted border border-aw-border"
        title={`${effectivePass.satname} · Active now`}
      >
        {effectivePass.satname} · Active now
      </span>

      <div className="absolute top-2.5 right-2.5 z-10 flex flex-col items-end gap-1.5">
        {previewToggle && (
          <div className="rounded-md bg-aw-bg/90 backdrop-blur-sm px-2 py-1 border border-aw-border">
            {previewToggle}
          </div>
        )}

        <button
          onClick={() => setCompassOpen((open) => !open)}
          className="cursor-pointer rounded-full bg-aw-bg/90 backdrop-blur-sm border border-aw-border p-1.5 text-aw-text-muted hover:text-aw-purple transition-colors"
          title={compassOpen ? "Hide compass" : "Show compass"}
        >
          {compassOpen ? <X size={14} /> : <Compass size={14} />}
        </button>

        {compassOpen && (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-aw-border bg-aw-bg/90 backdrop-blur-sm px-3 py-2 shadow-lg max-w-[160px]">
            {permission === "prompt-needed" ? (
              <>
                <button
                  onClick={requestAccess}
                  className="h-8 px-3 rounded-lg border border-aw-purple/45 bg-aw-purple/15 text-aw-purple text-[11px] font-medium hover:bg-aw-purple/25 transition-colors cursor-pointer"
                >
                  Enable compass
                </button>
                <p className="text-aw-text-muted text-[10px] text-center">
                  Tap to allow your compass for live pointing. Android
                  doesn&apos;t need this.
                </p>
              </>
            ) : (
              <>
                {hasCompass ? (
                  <CompassArrow
                    targetAz={liveAz}
                    heading={heading as number}
                    size={72}
                  />
                ) : (
                  <>
                    <div className="text-[14px] font-semibold tabular-nums text-center">
                      {Math.round(liveAz)}° ({azToCompass(liveAz)}),{" "}
                      {Math.round(liveEl)}° up
                    </div>
                    <p className="text-aw-text-muted text-[10px] text-center">
                      {permission === "denied"
                        ? "Compass denied — numeric only."
                        : "Compass unavailable — numeric only."}
                    </p>
                  </>
                )}

                <div className="w-full">
                  <div className="text-[16px] font-semibold text-aw-purple tabular-nums leading-none text-center">
                    {Math.round(liveEl)}°
                  </div>
                  <div className="text-[9px] text-aw-text-muted mt-0.5 text-center">
                    {isEstimating ? "Look up (est…)" : "Look up"}
                  </div>
                  <div className="flex gap-0.5 mt-1.5">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 h-0.5 rounded-full ${
                          i < Math.round(liveEl / 9)
                            ? "bg-aw-purple"
                            : "bg-aw-tint-hover"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {fetchError && (
                  <p className="text-aw-amber text-[9px] text-center">
                    {fetchError}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
