"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { pushSupported, useInstall } from "./pwa";

const KEY = "mvm-install-dismissed";
const QUIET_DAYS = 14;

/** A small "Get the app" card above the bottom bar on phones. Dismissing hides it for two weeks. */
export function InstallPrompt() {
  const path = usePathname();
  const { ready, platform, installed } = useInstall();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!ready || installed || platform === "desktop") return;
    try {
      const at = Number(localStorage.getItem(KEY) || 0);
      if (Date.now() - at < QUIET_DAYS * 86400e3) return;
    } catch {}
    // If the notifications card is about to ask first, wait until it has been answered.
    let pushPending = false;
    try {
      pushPending = pushSupported() && Notification.permission === "default" && Date.now() - Number(localStorage.getItem("mvm-push-asked") || 0) >= 7 * 86400e3;
    } catch {}
    let t: ReturnType<typeof setTimeout> | undefined;
    const start = (ms: number) => (t = setTimeout(() => setShow(true), ms));
    const onClosed = () => start(1500);
    if (pushPending) window.addEventListener("mvm-push-prompt-closed", onClosed, { once: true });
    else start(4500);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("mvm-push-prompt-closed", onClosed);
    };
  }, [ready, installed, platform]);

  if (!show || installed || path.startsWith("/admin") || path === "/app" || path.startsWith("/sell")) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {}
  };

  return (
    <div className="install-pop fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 md:hidden" role="dialog" aria-label="Get the app">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-surface p-3 shadow-xl shadow-slate-900/15">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Get the MV Markets app</p>
          <p className="truncate text-xs text-slate-500">Free · no app store needed</p>
        </div>
        <Link href="/app" onClick={() => setShow(false)} className="btn-accent btn-sm shrink-0">Get app</Link>
        <button type="button" onClick={dismiss} className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Not now">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
