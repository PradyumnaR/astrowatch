import "@testing-library/jest-dom/vitest";

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
