export interface Location {
  lat: number;
  lng: number;
  name: string; //human readonly city name
  alt?: number; //optional altitude in meters
  timezone: string;
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

// one per-second sample from N2YO's /positions endpoint
export interface SatellitePosition {
  azimuth: number;
  elevation: number;
  satlatitude: number;
  satlongitude: number;
  sataltitude: number;
  timestamp: number; // unix seconds
  ra?: number;
  dec?: number;
  eclipsed?: boolean;
}

export interface WeatherData {
  // current conditions for display
  viewingScore: number;
  cloudCover: number;
  temperature: number;
  windSpeed: number;
  moonPhase: string;
  moonIllumination: number;
  bortle: number;
  mag: number;
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

export interface WatchedPass {
  id: string; //Supabase row UUID — needed to delete/unwatch this specific pass
  noradId: number;
  satname: string;
  startUTC: number;
  passData: SatellitePass; //full enriched pass snapshot as of when it was watched
  savedAt: string; //ISO timestamp
}

export interface CelestrakSatellite {
  noradId: number;
  satname: string;
  category: string;
}

export type LocationStatus = "detecting" | "detected" | "denied" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
}

export interface KnowledgeChunk {
  id: string;
  content: string;
  source: string;
  category: string | null;
  metadata: {
    title?: string;
    url?: string;
    published_at?: string;
    news_site?: string;
    date?: string;
  };
  similarity: number;
}

export type UserPlan = "standard" | "pro";

export type McpServerName = "satellite" | "weather" | "knowledge";

// a row from mcp_api_keys — the raw key is never returned by GET,
// only once by POST at creation time
export interface McpApiKey {
  id: string;
  serverName: McpServerName;
  label: string | null;
  createdAt: string;
  revokedAt: string | null;
}
