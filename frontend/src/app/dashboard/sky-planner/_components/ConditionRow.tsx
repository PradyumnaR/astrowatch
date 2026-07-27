import { ReactNode } from "react";

export default function ConditionRow({
  icon,
  label,
  value,
  children,
}: {
  icon: string;
  label: string;
  value: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span
          className="text-[11px] text-aw-text-muted
          flex items-center gap-1.5"
        >
          {icon} {label}
        </span>
        <span className="text-[12px] font-medium text-aw-text">{value}</span>
      </div>
      {children}
    </div>
  );
}
