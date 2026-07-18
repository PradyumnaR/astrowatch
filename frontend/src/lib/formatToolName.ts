export function formatToolName(tool: string): string {
  const labels: Record<string, string> = {
    get_satellite_passes: "🛰 Passes",
    get_weather: "🌤 Weather",
    search_knowledge: "📚 Knowledge",
  };

  return labels[tool] ?? tool;
}
