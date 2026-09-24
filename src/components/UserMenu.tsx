"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/actions/auth";

export function UserMenu({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const links = [
    ["/account", "Dashboard"],
    ["/account/listings", "My listings"],
    ["/messages", "Messages"],
    ["/account/saved", "Saved items"],
    ["/account/vip", "Stars & VIP"],
    ["/account/business", "Business"],
    ["/account/settings", "Settings"],
    ["/app", "Get the app"],
  ];
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{name.charAt(0).toUpperCase()}</span>
        <span className="hidden max-w-24 truncate lg:inline">{name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-surface py-1.5 shadow-lg shadow-slate-900/5">
          {links.map(([href, label]) => (
            <Link key={href} href={href} role="menuitem" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900" onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin" role="menuitem" className="block border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-ocean-700 hover:bg-slate-50" onClick={() => setOpen(false)}>
              Admin dashboard
            </Link>
          )}
          <form action={logoutAction} className="border-t border-slate-100">
            <button type="submit" className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
