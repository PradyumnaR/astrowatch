import type { McpServerName } from "@/types";

// Pure data — imported by both route handlers and client components,
// so no React/icon imports live here. Icons are mapped in the UI.
//
// Deliberately excludes astrowatch-calendar: that server is internal-only
// (no bearer auth, only ever called by our own backend) so it has no
// user-issuable keys and no place on the Developer page.
export const MCP_SERVER_NAMES = [
  "satellite",
  "weather",
  "knowledge",
] as const satisfies readonly McpServerName[];

export function isMcpServerName(value: unknown): value is McpServerName {
  return (
    typeof value === "string" &&
    (MCP_SERVER_NAMES as readonly string[]).includes(value)
  );
}

export interface McpServerMeta {
  name: McpServerName;
  /** FastMCP server name, e.g. astrowatch-satellite */
  serverId: string;
  displayName: string;
  blurb: string;
  tools: string[];
}

export const MCP_SERVERS: Record<McpServerName, McpServerMeta> = {
  satellite: {
    name: "satellite",
    serverId: "astrowatch-satellite",
    displayName: "Satellite",
    blurb: "Upcoming visible passes and what's overhead right now.",
    tools: ["get_satellite_passes", "get_visible_satellites"],
  },
  weather: {
    name: "weather",
    serverId: "astrowatch-weather",
    displayName: "Weather",
    blurb: "Sky conditions scored for observing, now or at a given hour.",
    tools: ["get_viewing_conditions", "get_weather_at_time"],
  },
  knowledge: {
    name: "knowledge",
    serverId: "astrowatch-knowledge",
    displayName: "Knowledge",
    blurb: "Semantic search over the AstroWatch space knowledge base.",
    tools: ["search_space_knowledge", "get_satellite_info"],
  },
};

/**
 * Raw key prefix, e.g. "sk-aw-sat-". Must stay in lockstep with the
 * format the Python verifier is handed — see backend/mcp_servers/auth.py.
 */
export function keyPrefix(serverName: McpServerName): string {
  return `sk-aw-${serverName.slice(0, 3)}-`;
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export function mcpEndpoint(serverName: McpServerName): string {
  return `${BACKEND_URL}/mcp/${serverName}`;
}
