import { create } from "zustand";
import type {
  Location,
  LocationStatus,
  SatellitePass,
  WeatherData,
  SavedSatellite,
} from "@/types";
import { DEFAULT_LOCATION } from "@/consts";

import { reverseGeocode } from "@/lib/geocode";

interface AstroStore {
  //location
  location: Location | null;
  locationStatus: LocationStatus;
  setLocation: (l: Location) => void;
  fetchLocation: () => void;
  //passes
  passes: SatellitePass[];
  selectedPass: SatellitePass | null;
  isLoadingPasses: boolean;
  setPasses: (p: SatellitePass[]) => void;
  setSelectedPass: (p: SatellitePass) => void;
  setLoadingPasses: (b: boolean) => void;
  ///weather
  weather: WeatherData | null;
  isLoadingWeather: boolean;
  setWeather: (w: WeatherData) => void;
  setLoadingWeather: (b: boolean) => void;
  //saved satellite
  savedSatellites: SavedSatellite[];
  savedPasses: SatellitePass[];
  isLoadingSaved: boolean;
  setSavedSatellites: (s: SavedSatellite[]) => void;
  addSaved: (s: SavedSatellite) => void;
  setSavedPasses: (p: SatellitePass[]) => void;
  removeSaved: (noraId: number) => void;
  setLoadingSaved: (b: boolean) => void;
  // pass cache — avoids repeat N2YO calls
  passCache: Record<number, SatellitePass[]>;
  setPassCache: (noradId: number, passes: SatellitePass[]) => void;
  removePassCache: (noradId: number) => void;
  clearPassCache: () => void;
}

export const useAstroStore = create<AstroStore>()((set) => ({
  //locations
  location: null,
  locationStatus: "detecting",
  setLocation: (l) => set({ location: l }),
  fetchLocation: () => {
    set({ locationStatus: "detecting" });

    // browser doesn't support geolocation
    if (!navigator.geolocation) {
      set({ location: { ...DEFAULT_LOCATION }, locationStatus: "error" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      // ── success ──
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const name = await reverseGeocode(lat, lng);
        set({ location: { lat, lng, name }, locationStatus: "detected" });
      },
      // ── denied / error ──
      () => {
        set({ location: { ...DEFAULT_LOCATION }, locationStatus: "denied" });
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  },
  // passes
  passes: [],
  selectedPass: null,
  isLoadingPasses: false,
  setPasses: (p) => set({ passes: p }),
  setSelectedPass: (p) => set({ selectedPass: p }),
  setLoadingPasses: (b) => set({ isLoadingPasses: b }),
  //weather
  weather: null,
  isLoadingWeather: false,
  setWeather: (w) => set({ weather: w }),
  setLoadingWeather: (b) => set({ isLoadingWeather: b }),
  //saved Satellites
  savedSatellites: [],
  savedPasses: [],
  isLoadingSaved: false,
  setSavedSatellites: (s) => set({ savedSatellites: s }),
  addSaved: (s) =>
    set((state) => ({
      savedSatellites: [...state.savedSatellites, s],
    })),
  removeSaved: (noradId) =>
    set((state) => ({
      savedSatellites: state.savedSatellites.filter(
        (s) => s.noradId !== noradId,
      ),
    })),
  setLoadingSaved: (b) => set({ isLoadingSaved: b }),
  setSavedPasses: (p) => set({ savedPasses: p }),
  // pass cache
  passCache: {},
  setPassCache: (noradId, passes) =>
    set((state) => ({
      passCache: { ...state.passCache, [noradId]: passes },
    })),
  removePassCache: (noradId) =>
    set((state) => {
      const newPassesCache = { ...state.passCache };
      delete newPassesCache[noradId];
      return { passCache: { ...newPassesCache } };
    }),
  clearPassCache: () => set({ passCache: {} }),
}));
