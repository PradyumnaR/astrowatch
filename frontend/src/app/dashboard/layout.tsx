import NavBar from "./_components/NavBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-aw-bg text-white">
      <NavBar />
      <div className="pt-[50px] min-h-screen">{children}</div>
    </div>
  );
}
