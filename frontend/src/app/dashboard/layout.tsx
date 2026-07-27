import NavBar from "./_components/NavBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-aw-bg text-aw-text overflow-y-hidden">
      <NavBar />
      <div className="pt-[50px]">{children}</div>
    </div>
  );
}
