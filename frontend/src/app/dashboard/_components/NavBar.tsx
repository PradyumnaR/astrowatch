"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import NavLink from "./NavLink";
import { useTheme } from "@/hooks/useTheme";

const NAV_LINKS = [
  { href: "/dashboard/sky-planner", label: "Sky planner" },
  { href: "/dashboard/my-satellites", label: "Satellites" },
  { href: "/dashboard/developer", label: "Developer" },
  { href: "/dashboard/settings", label: "Settings" },
  // { href: "/dashboard/explore", label: "Explore" },
];

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: "light" | "dark";
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label="Toggle theme"
      className="h-8 px-3 rounded-lg border border-aw-border
        text-[13px] text-aw-text-sec hover:text-aw-text transition-colors cursor-pointer"
    >
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}

function AuthButtons() {
  return (
    <Show when="signed-out">
      <SignInButton mode="modal">
        <button
          className="h-8 px-3 rounded-lg border border-aw-border
            text-[13px] text-aw-text-sec hover:text-aw-text transition-colors"
        >
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button
          className="h-8 px-3 rounded-lg bg-aw-purple/20 border border-aw-purple/30
            text-[13px] font-medium text-aw-purple hover:bg-aw-purple/30 transition-colors"
        >
          Sign up
        </button>
      </SignUpButton>
    </Show>
  );
}

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  const handleNavigation = () => {
    router.push("/dashboard/sky-planner");
  };

  // Close the mobile menu whenever the route changes.
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
  }

  // Close the mobile menu on Escape.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);

  return (
    <header className="fixed top-0 left-0 z-50 h-[50px] min-w-full bg-aw-bg border-b border-aw-border px-5 flex items-center gap-4 cursor-pointer text-aw-text-sec hover:text-aw-text">
      {/* Logo */}
      <div
        className="flex items-center gap-2 text-[15px] font-medium"
        onClick={handleNavigation}
      >
        <div
          className="w-7 h-7 rounded-lg bg-aw-purple/20
            border border-aw-purple/30
            flex items-center justify-center"
        >
          <div className="w-2 h-2 rounded-full bg-aw-purple" />
        </div>
        AstroWatch
      </div>

      <nav className="hidden md:flex gap-1 flex-1">
        {NAV_LINKS.map(({ href, label }) => (
          <NavLink key={href} href={href}>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Right icons */}
      <div className="flex items-center gap-2 ml-auto md:ml-0">
        {/* Theme toggle + sign in/up stay in the bar on desktop; on mobile
           they move into the drawer below so the bar never overflows. */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <AuthButtons />
        </div>
        <Show when="signed-in">
          <UserButton />
        </Show>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-nav-panel"
          className="md:hidden h-8 w-8 flex items-center justify-center rounded-lg border border-aw-border
            text-aw-text-sec hover:text-aw-text transition-colors cursor-pointer"
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile nav drawer */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <nav
            id="mobile-nav-panel"
            aria-label="Mobile navigation"
            className="fixed top-[50px] left-0 right-0 z-40 md:hidden
              bg-aw-bg border-b border-aw-border
              flex flex-col gap-1 p-3 shadow-2xl"
          >
            {NAV_LINKS.map(({ href, label }) => (
              <NavLink
                key={href}
                href={href}
                onClick={() => setMobileMenuOpen(false)}
              >
                {label}
              </NavLink>
            ))}
            <div className="mt-2 pt-2 border-t border-aw-border flex items-center gap-2">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <AuthButtons />
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
