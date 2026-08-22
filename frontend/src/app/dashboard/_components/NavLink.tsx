"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export default function NavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors",
        isActive
          ? "bg-aw-purple/15 text-aw-purple"
          : "text-aw-text-sec hover:text-aw-text hover:bg-aw-tint",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
