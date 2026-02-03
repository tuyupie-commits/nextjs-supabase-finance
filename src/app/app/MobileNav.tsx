"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app", label: "Home" },
  { href: "/app/transactions", label: "Tx" },
  { href: "/app/budgets", label: "Budgets" },
  { href: "/app/goals", label: "Goals" },
  { href: "/app/settings", label: "Settings" },
  // { href: "/app/wallets", label: "Wallets" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 md:hidden border-t border-white/10 bg-black/90 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5">
        {items.map((it) => {
          const active =
            it.href === "/app"
              ? pathname === "/app"
              : pathname.startsWith(it.href);

          return (
            <Link
              key={it.href}
              href={it.href}
              className={[
                "py-3 text-center text-xs",
                active ? "text-white font-semibold" : "text-white/60",
              ].join(" ")}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
