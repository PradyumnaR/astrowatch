import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// @testing-library/react's auto-cleanup between tests relies on detecting a
// *global* afterEach — this project doesn't set vitest's `test.globals`
// (test files import afterEach/etc. from "vitest" explicitly instead), so
// that auto-detection never fires and each render()'s DOM was silently
// piling up across tests. Register it explicitly instead.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement ResizeObserver — stub it so components that use
// one (e.g. to keep a MapLibre canvas in sync with its container) can
// mount in tests without crashing.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
