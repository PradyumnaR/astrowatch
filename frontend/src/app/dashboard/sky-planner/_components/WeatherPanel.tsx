"use client";

import { useAstroStore } from "@/stores/astrowatch";
import WeatherSkeleton from "./WeatherSkeleton";
import ConditionRow from "./ConditionRow";
import ProgressBar from "@/components/ProgressBar";
import ViewingScore from "./ViewingScore";

export default function WeatherPanel() {
  const { selectedPass, weather } = useAstroStore();

  if (!weather) {
    return <WeatherSkeleton />;
  }

  const { cloudCover, temperature, windSpeed, moonPhase, bortle, mag } =
    weather;

  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionLabel>
          <div className="flex flex-col">
            <span className="text-[10px] font-medium tracking-widest uppercase text-aw-text-muted">
              Viewing conditions for satellite
            </span>
            <span>
              <span className="font-medium text-aw-text">
                {selectedPass?.satname}
              </span>{" "}
              #{selectedPass?.satid}
            </span>
          </div>
        </SectionLabel>
        <div className="flex flex-col gap-3">
          <ConditionRow icon="☁" label="Cloud cover" value={`${cloudCover}%`}>
            <ProgressBar
              value={cloudCover}
              max={100}
              color={
                cloudCover < 30
                  ? "bg-aw-teal"
                  : cloudCover < 70
                    ? "bg-aw-amber"
                    : "bg-red-500"
              }
            />
          </ConditionRow>
          <ConditionRow icon="🌙" label="Moon" value={moonPhase} />

          <ConditionRow icon="👁" label="Bortle scale" value={`${bortle} / 9`}>
            <ProgressBar value={bortle} max={9} color="bg-aw-amber" />
          </ConditionRow>

          <ConditionRow
            icon="🌡"
            label="Temperature"
            value={`${Math.round(temperature)}°F`}
          />

          <ConditionRow
            icon="💨"
            label="Wind"
            value={`${Math.round(windSpeed)} mph`}
          />

          <ConditionRow
            icon="🛰️"
            label="Satellite birghtness"
            value={`${mag}`}
          />

          <ConditionRow
            icon="↗️"
            label="Max elevation"
            value={`${selectedPass?.maxEl}`}
          />
        </div>
      </section>
      {selectedPass && (
        <section>
          <SectionLabel>Visibility - {selectedPass.satname}</SectionLabel>
          <ViewingScore score={selectedPass.viewingScore ?? 0} />
        </section>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-medium tracking-widest
        uppercase text-aw-text-muted mb-2"
    >
      {children}
    </div>
  );
}
