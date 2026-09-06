#!/usr/bin/env node
// Copies MapLibre GL's worker bundle (+ its "shared" chunk, which the
// worker itself imports via a relative `./maplibre-gl-shared.mjs`) from
// node_modules into public/maplibre, so they can be self-hosted via
// maplibregl.setWorkerUrl() in SatelliteMapCompass.tsx.
//
// Why: maplibre-gl resolves its worker script at runtime via
// `new Worker(new URL("./maplibre-gl-worker.mjs", import.meta.url), { type: "module" })`.
// That pattern needs bundler-level support to rewrite the URL correctly;
// when it isn't wired up (seen here with Next.js/Turbopack in production),
// the browser ends up requesting a module script at a URL that doesn't
// actually exist, gets an HTML 404 page back instead, and refuses to
// execute it ("non-JavaScript MIME type") — leaving the map silently
// blank. Self-hosting a real, stable copy of the worker sidesteps that
// resolution entirely.
//
// Run via the `postinstall` and `build` scripts so this stays in sync with
// whatever maplibre-gl version is installed, without committing a copy of
// node_modules content to git (see .gitignore).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "..", "node_modules", "maplibre-gl", "dist");
const destDir = join(__dirname, "..", "public", "maplibre");

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

if (!existsSync(srcDir)) {
  console.warn(
    `[copy-maplibre-worker] ${srcDir} not found — is maplibre-gl installed? Skipping.`,
  );
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });

for (const file of files) {
  const src = join(srcDir, file);
  if (!existsSync(src)) {
    console.warn(`[copy-maplibre-worker] missing ${src}, skipping`);
    continue;
  }
  copyFileSync(src, join(destDir, file));
}

console.log(
  `[copy-maplibre-worker] copied maplibre-gl worker files to ${destDir}`,
);
