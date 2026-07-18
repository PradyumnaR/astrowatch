"use client";

import { useEffect, useState } from "react";
import { useAstroStore } from "@/stores/astrowatch";
import { KnowledgeChunk } from "@/types";
import { getSourceBadge } from "@/lib/getSourceBadge";
import { timeAgo } from "@/lib/timeAgo";

import LoadingSkeleton from "@/components/LoadingSkeleton";

export default function RagPanel() {
  const { selectedPass } = useAstroStore();

  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const BACKEND_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

  useEffect(() => {
    if (!selectedPass) {
      setChunks([]);
      return;
    }
    fetchKnowledge(selectedPass.satname, selectedPass.satid);
  }, [selectedPass?.satid]);

  async function fetchKnowledge(satname: string, norad_id: number) {
    setIsLoading(true);
    setChunks([]);

    try {
      const res = await fetch(`${BACKEND_URL}/agents/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: satname,
          limit: 3,
          norad_id,
        }),
      });

      if (!res.ok) throw new Error("Knowledge fetch failed");

      const data = await res.json();
      setChunks(data.chunks ?? []);
    } catch (err) {
      console.error("RagPanel error:", err);
      setChunks([]);
    } finally {
      setIsLoading(false);
    }
  }

  const description = chunks.find(
    (c) => c.source === "wikipedia" || c.source === "nasa_apod",
  );

  const news = chunks
    .filter((c) => c.source === "spaceflight_news")
    .slice(0, 3);

  if (!selectedPass) return;

  return (
    <div
      className="flex flex-col gap-3 pt-10
      border-t border-aw-border"
    >
      {/* section label */}
      <p
        className="text-[10px] font-medium tracking-widest
        uppercase text-white/25"
      >
        RAG Knowledge Panel
      </p>

      {isLoading ? (
        <LoadingSkeleton />
      ) : chunks.length === 0 ? null : (
        <>
          {/* description snippet */}
          {description && (
            <div
              className="flex flex-col gap-2
              bg-white/[0.03] border border-aw-border
              rounded-xl p-3"
            >
              {/* source badge */}
              <SourceBadge source={description.source} />

              {/* title */}
              {description.metadata.title && (
                <p
                  className="text-[11px] font-medium
                  text-white leading-snug"
                >
                  {description.metadata.title}
                </p>
              )}

              {/* content snippet */}
              <p
                className="text-[11px] text-white/50
                leading-relaxed line-clamp-4"
              >
                {description.content}
              </p>

              {/* read more */}
              {description.metadata.url && (
                <a
                  href={description.metadata.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-aw-purple/70
                    hover:text-aw-purple transition-colors
                    self-start"
                >
                  Read more →
                </a>
              )}
            </div>
          )}

          {/* news items */}
          {news.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p
                className="text-[10px] font-medium
                tracking-widest uppercase text-white/20"
              >
                Recent news
              </p>

              {news.map((chunk) => (
                <NewsItem key={chunk.id} chunk={chunk} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NewsItem({ chunk }: { chunk: KnowledgeChunk }) {
  const badge = getSourceBadge(chunk.source);
  const ago = timeAgo(chunk.metadata.published_at);

  return (
    <a
      href={chunk.metadata.url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-1
          bg-white/[0.02] border border-aw-border
          rounded-lg px-3 py-2
          hover:bg-white/[0.05] transition-colors
          group"
    >
      {/* title */}
      <p
        className="text-[11px] font-medium text-white/70
          group-hover:text-white transition-colors
          line-clamp-2 leading-snug"
      >
        {chunk.metadata.title ?? chunk.content.slice(0, 80)}
      </p>

      {/* source + time */}
      <div className="flex items-center gap-2">
        <span
          className={`text-[9px] font-medium
            px-1.5 py-0.5 rounded-full border
            ${badge.color}`}
        >
          {badge.label}
        </span>
        {ago && <span className="text-[9px] text-white/20">{ago}</span>}
        <span className="text-[9px] text-white/20 ml-auto">→</span>
      </div>
    </a>
  );
}

// ── sub-components ────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const badge = getSourceBadge(source);
  return (
    <span
      className={`self-start text-[9px] font-medium
        px-2 py-0.5 rounded-full border ${badge.color}`}
    >
      {badge.label}
    </span>
  );
}
