"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyButton({
  value,
  label,
  className = "",
}: {
  value: string;
  /** accessible name, e.g. "Copy satellite endpoint" */
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.error("Clipboard write failed:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      aria-label={label}
      title={label}
      className={[
        "flex-shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-lg",
        "border border-aw-border text-[11px] font-medium",
        "transition-colors cursor-pointer",
        copied
          ? "text-aw-teal border-aw-teal/30 bg-aw-teal/10"
          : "text-aw-text-sec hover:text-aw-text hover:bg-aw-tint-hover",
        className,
      ].join(" ")}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
