import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import NavLink from "./NavLink";

export default function NavBar() {
  return (
    <header className="fixed top-0 left-0 z-50 h-[50px] min-w-full bg-[#0d0d1a] border-b border-aw-border px-5 flex items-center gap-4">
      {/* Logo */}
      <div className="flex items-center gap-2 text-[15px] font-medium">
        <div
          className="w-7 h-7 rounded-lg bg-aw-purple/20
            border border-aw-purple/30
            flex items-center justify-center"
        >
          <div className="w-2 h-2 rounded-full bg-aw-purple" />
        </div>
        AstroWatch
      </div>

      <nav className="flex gap-1 flex-1">
        <NavLink href="/dashboard/sky-planner">Sky planner</NavLink>
        <NavLink href="/dashboard/my-passes">My passes</NavLink>
        {/* <NavLink href="/dashboard/explore">Explore</NavLink>
        <NavLink href="/dashboard/mcp-apis">MCP APIs</NavLink> */}
      </nav>

      {/* Right icons */}
      <div className="flex items-center gap-2">
        <button
          className="w-8 h-8 rounded-lg border border-aw-border
            flex items-center justify-center
            text-white/50 hover:text-white transition-colors"
        >
          △
        </button>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button
              className="h-8 px-3 rounded-lg border border-aw-border
                text-[13px] text-white/70 hover:text-white transition-colors"
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
        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>
    </header>
  );
}
