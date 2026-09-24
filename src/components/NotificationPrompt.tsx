"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BellRing, X } from "lucide-react";
import { enablePush, pushSupported } from "./pwa";

const KEY = "mvm-push-asked";
const QUIET_DAYS = 7;

/**
 * Friendly "turn on notifications" card. The phone's own permission dialog only appears when the
 * customer taps Allow (browsers block or penalise permission prompts that appear on their own).
 */
export function NotificationPrompt() {
  const path = usePathname();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported() || Notification.permission !== "default") return;
    try {
      if (Date.now() - Number(localStorage.getItem(KEY) || 0) < QUIET_DAYS * 86400e3) return;
    } catch {}
    const t = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(t);
  }, []);

  if (!show || path.startsWith("/admin")) return null;

  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {}
    window.dispatchEvent(new Event("mvm-push-prompt-closed"));
  };

  return (
    <div className="push-pop fixed inset-x-3 top-3 z-50 mx-auto max-w-md" role="dialog" aria-label="Turn on notifications">
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-surface p-4 shadow-2xl shadow-slate-900/20">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ocean-600 text-white">
          <BellRing className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Turn on notifications?</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">Be the first to see new items for sale, plus giveaways and app updates.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await enablePush();
                } finally {
                  close();
                }
              }}
              className="btn-accent btn-sm"
            >
              {busy ? "Turning on…" : "Allow"}
            </button>
            <button type="button" onClick={close} className="btn-ghost btn-sm">Not now</button>
          </div>
        </div>
        <button type="button" onClick={close} className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
