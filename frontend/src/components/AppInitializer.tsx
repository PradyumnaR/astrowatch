"use client";
import { useEffect, useRef } from "react";
import { useAstroStore } from "@/stores/astrowatch";
import { useSavedSatellites } from "@/hooks/useSavedSatellites";
import { useAuth } from "@clerk/nextjs";

export default function AppInitializer() {
  const { fetchLocation, location } = useAstroStore();
  const { initSavedSatAndPasses } = useSavedSatellites();
  const { setUserPlan } = useAstroStore();

  const { isSignedIn, isLoaded } = useAuth();
  // prevent double sync in React StrictMode
  const hasSynced = useRef(false);

  useEffect(() => {
    fetchLocation();
  }, []);

  useEffect(() => {
    initSavedSatAndPasses();
  }, [location?.lat, location?.lng]);

  useEffect(() => {
    // wait for Clerk to load
    if (!isLoaded || !isSignedIn) return;
    hasSynced.current = true;

    async function syncUser() {
      try {
        const res = await fetch("/api/users/sync", {
          method: "POST",
        });
        const data = await res.json();
        console.log(`User sync: ${data.status}`);
      } catch (err) {
        // silent fail — never block the user
        console.error("User sync failed:", err);
      }

      try {
        const res = await fetch("/api/users/me");
        const data = await res.json();

        setUserPlan(data.plan ?? "standard");
      } catch (err) {
        console.error("Plan fetch failed:", err);
        setUserPlan("standard");
      }
    }

    syncUser();
  }, [isSignedIn, isLoaded]);

  return null;
}
