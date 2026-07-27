"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "aw-theme";

/** Remove any existing theme class from <html> and apply the given one. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

/**
 * Light/dark theme state. Defaults to dark, persists to localStorage under
 * "aw-theme", and toggles the class on <html>. The color switching itself
 * lives in globals.css (html.dark / html.light re-point the --aw-* vars).
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");

  // on mount, hydrate from localStorage and apply
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial: Theme = stored === "light" || stored === "dark" ? stored : "dark";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  return { theme, toggleTheme };
}
