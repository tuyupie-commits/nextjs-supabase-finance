import SidebarNav from "./SidebarNav";
import MobileNav from "./MobileNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex bg-black text-white">
      <aside className="w-60 border-r border-white/10 p-4 hidden md:block">
        <div className="font-semibold mb-4">Finance</div>
        <SidebarNav />
      </aside>

      <main className="flex-1 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-4">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
