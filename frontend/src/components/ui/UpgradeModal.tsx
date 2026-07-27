"use client";

interface UpgradeModalProps {
  title: string;
  message: string;
  onClose: () => void;
}

export default function UpgradeModal({
  onClose,
  title,
  message,
}: UpgradeModalProps) {
  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-50
          bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* modal */}
      <div
        className="fixed z-50 top-1/2 left-1/2
        -translate-x-1/2 -translate-y-1/2
        w-[340px] bg-aw-bg
        border border-aw-border rounded-2xl
        p-6 flex flex-col gap-4 shadow-2xl"
      >
        {/* icon */}
        <div
          className="w-10 h-10 rounded-xl
          bg-aw-amber/10 border border-aw-amber/20
          flex items-center justify-center
          text-xl"
        >
          🔒
        </div>

        {/* title */}
        <div className="flex flex-col gap-1">
          <p className="text-[14px] font-semibold text-aw-text">{title}</p>
          <p
            className="text-[12px] text-aw-text-sec
            leading-relaxed"
          >
            {message}
          </p>
        </div>

        {/* close button */}
        <button
          onClick={onClose}
          className="w-full py-2 rounded-xl
            bg-aw-tint-hover border border-aw-border
            text-[12px] font-medium text-aw-text-sec
            hover:bg-aw-tint-hover hover:text-aw-text
            transition-colors"
        >
          Got it
        </button>
      </div>
    </>
  );
}
