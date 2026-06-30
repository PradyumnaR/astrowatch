"use client";
import { useEffect } from "react";
import { useAstroStore } from "@/stores/astrowatch";
import { useSavedSatellites } from "@/hooks/useSavedSatellites";

export default function AppInitializer() {
  const { fetchLocation, location } = useAstroStore();
  const { initSavedSatAndPasses } = useSavedSatellites();

  useEffect(() => {
    fetchLocation();
  }, []);

  useEffect(() => {
    initSavedSatAndPasses();
  }, [location?.lat, location?.lng]);

  return null;
}
