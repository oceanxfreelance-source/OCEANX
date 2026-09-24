"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Home, MessageSquare, Plus, Search, User } from "lucide-react";

export function BottomNav({ signedIn, unread }: { signedIn: boolean; unread: number }) {
  const path = usePathname();
  if (path.startsWith("/admin")) return null;
  const items = [
    { href: "/", label: "Home", Icon: Home },
    { href: "/search", label: "Browse", Icon: Search },
    { href: "/sell", label: "Sell", Icon: Plus, accent: true },
    { href: "/messages", label: "Chats", Icon: MessageSquare, badge: unread },
    { href: signedIn ? "/account" : "/login", label: "Account", Icon: User },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden" aria-label="Main">
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, Icon, accent, badge }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} className={clsx("relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-slate-900" : "text-slate-500")}>
                {accent ? (
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-ocean-600 text-white shadow-sm">
                    <Icon className="h-5 w-5" strokeWidth={2.25} />
                  </span>
                ) : (
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                )}
                {!accent && label}
                {!!badge && <span className="absolute right-[26%] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-semibold text-white">{badge}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
