export interface Location {
  lat: number;
  lng: number;
  name: string; //human readonly city name
  alt?: number; //optional altitude in meters
}

export interface SatellitePass {
  satid: number;
  satname: string;
  startAz: number;
  startAzCompass: string;
  startEl: number;
  startUTC: number;
  maxAz: number;
  maxEl: number;
  maxUTC: number;
  endAz: number;
  endUTC: number;
  mag: number; // lower value more brighter. Higher value less brighter
  duration: number;
  viewingScore?: number;
  cloudCover?: number;
  temperature?: number;
  windSpeed?: number;
  moonPhase?: string;
  moonIllumination?: number;
}

export interface WeatherData {
  // current conditions for display
  cloudCover: number;
  temperature: number;
  windSpeed: number;
  moonPhase: string;
  moonIllumination: number;
  bortle: number;
}

export interface WeatherApiResponse {
  hourly: {
    time: string[];
    cloudCover: number[];
    temperature: number[];
    windSpeed: number[];
  };
}

export interface SavedSatellite {
  id: string; //Supabase row UUID
  noradId: number; //NORAD catalog ID e.g. 25544
  satname: string;
  savedAt: string; //ISO timestamp
}

export interface CelestrakSatellite {
  noradId: number;
  satName: string;
  category: string;
}

export type LocationStatus = "detecting" | "detected" | "denied" | "error";
