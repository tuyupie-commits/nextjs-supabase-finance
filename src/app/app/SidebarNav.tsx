"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

const items: Item[] = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/transactions", label: "Transactions" },
  { href: "/app/budgets", label: "Budgets" },
  { href: "/app/goals", label: "Goals" },
  { href: "/app/settings", label: "Settings" },
  // nếu bạn đã làm categories/wallets thì mở 2 dòng dưới
  // { href: "/app/categories", label: "Categories" },
  { href: "/app/wallets", label: "Wallets" },
];

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1 text-sm">
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
              "block rounded px-3 py-2 transition",
              active
                ? "bg-white text-black font-medium"
                : "text-white/80 hover:bg-white/10 hover:text-white",
            ].join(" ")}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
