import { create } from "zustand";
import type {
  Location,
  LocationStatus,
  SatellitePass,
  WeatherData,
  SavedSatellite,
  WeatherApiResponse,
  UserPlan,
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
  //weather open-meteo response
  weatherOm: WeatherApiResponse | null;
  setWeatherOm: (w: WeatherApiResponse) => void;
  //saved satellite
  savedSatellites: SavedSatellite[];
  isLoadingSaved: boolean;
  setLoadingSaved: (b: boolean) => void;
  setSavedSatellites: (s: SavedSatellite[]) => void;
  addSaved: (s: SavedSatellite) => void;
  removeSaved: (noraId: number) => void;
  //saved passes
  savedPasses: SatellitePass[];
  isLoadingSavedPasses: boolean;
  setIsLoadingSavedPasses: (b: boolean) => void;
  setSavedPasses: (p: SatellitePass[]) => void;
  // pass cache — avoids repeat N2YO calls
  passCache: Record<number, SatellitePass[]>;
  setPassCache: (cache: Record<number, SatellitePass[]>) => void;
  clearPassCache: () => void;
  // user plan
  userPlan: UserPlan | null;
  setUserPlan: (plan: UserPlan) => void;
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
      set({
        location: {
          ...DEFAULT_LOCATION,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        locationStatus: "error",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      // ── success ──
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const name = await reverseGeocode(lat, lng);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        //                ↑ gets browser timezone
        //                e.g. "America/Los_Angeles"
        set({
          location: { lat, lng, name, timezone },
          locationStatus: "detected",
        });
      },
      // ── denied / error ──
      () => {
        set({
          location: {
            ...DEFAULT_LOCATION,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          locationStatus: "denied",
        });
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
  weatherOm: null,
  setWeatherOm: (w) =>
    set({
      weatherOm: w,
    }),
  //saved Satellites
  savedSatellites: [],
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
  //saved passes
  savedPasses: [],
  isLoadingSavedPasses: false,
  setIsLoadingSavedPasses: (b) => set({ isLoadingSavedPasses: b }),
  setSavedPasses: (p) => set({ savedPasses: p }),
  // pass cache
  passCache: {},
  setPassCache: (cache: {}) => set({ passCache: { ...cache } }),
  clearPassCache: () => set({ passCache: {} }),

  //userPlan
  userPlan: null,
  setUserPlan: (plan) =>
    set({
      userPlan: plan,
    }),
}));
