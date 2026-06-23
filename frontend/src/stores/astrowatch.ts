import { create } from "zustand";
import type { Location, SatellitePass, WeatherData } from "@/types";

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
}));
