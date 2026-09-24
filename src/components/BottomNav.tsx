"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function BottomNav({ signedIn, unread }: { signedIn: boolean; unread: number }) {
  const path = usePathname();
  if (path.startsWith("/admin")) return null;
  const items = [
    { href: "/", label: "Home", icon: "🏠" },
    { href: "/search", label: "Search", icon: "🔍" },
    { href: "/sell", label: "Sell", icon: "➕", accent: true },
    { href: "/messages", label: "Chats", icon: "💬", badge: unread },
    { href: signedIn ? "/account" : "/login", label: "Account", icon: "👤" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main">
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link href={it.href} className={clsx("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-ocean-700" : "text-slate-500")}>
                <span className={clsx("text-lg", it.accent && "grid h-9 w-9 place-items-center rounded-full bg-coral-500 text-white shadow")}>{it.icon}</span>
                {!it.accent && it.label}
                {!!it.badge && <span className="absolute right-4 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white">{it.badge}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
