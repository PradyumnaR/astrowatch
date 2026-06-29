"use client";
import { useEffect } from "react";
import { useAstroStore } from "@/stores/astrowatch";

export default function AppInitializer() {
  const { fetchLocation } = useAstroStore();

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  return null;
}
