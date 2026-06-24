import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div
      className="min-h-screen flex flex-col
        items-center justify-center gap-6"
      style={{ background: "#0d0d1a" }}
    >
      {/* AstroWatch logo above Clerk UI */}
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg
            flex items-center justify-center"
          style={{
            background: "rgba(124,111,247,0.15)",
            border: "1px solid rgba(124,111,247,0.3)",
          }}
        >
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: "#7c6ff7" }}
          />
        </div>
        <span className="text-lg font-medium" style={{ color: "#e8e8f5" }}>
          AstroWatch
        </span>
      </div>

      {/* Clerk handles everything below */}
      <SignIn />
    </div>
  );
}
