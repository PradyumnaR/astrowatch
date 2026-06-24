import { create } from "zustand";
import type {
  Location,
  SatellitePass,
  WeatherData,
  SavedSatellite,
} from "@/types";

interface AstroStore {
  //location
  location: Location | null;
  setLocation: (l: Location) => void;
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
  isLoadingSaved: boolean;
  setSavedSatellites: (s: SavedSatellite[]) => void;
  addSaved: (s: SavedSatellite) => void;
  removeSaved: (noraId: number) => void;
  setLoadingSaved: (b: boolean) => void;
  // pass cache — avoids repeat N2YO calls
  passCache: Record<number, SatellitePass[]>;
  setPassCache: (noradId: number, passes: SatellitePass[]) => void;
  clearPassCache: () => void;
}

export const useAstroStore = create<AstroStore>()((set) => ({
  //locations
  location: null,
  setLocation: (l) => set({ location: l }),
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
  // pass cache
  passCache: {},
  setPassCache: (noradId, passes) =>
    set((state) => ({
      passCache: { ...state.passCache, [noradId]: passes },
    })),
  clearPassCache: () => set({ passCache: {} }),
}));
