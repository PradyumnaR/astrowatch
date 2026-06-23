"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export default function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={[
        "px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors",
        isActive
          ? "bg-aw-purple/15 text-aw-purple"
          : "text-white/50 hover:text-white hover:bg-white/5",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
