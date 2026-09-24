"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { disablePush, enablePush, pushEnabled, pushSupported } from "./pwa";

/** Phone/browser notifications on/off for this device (account settings). */
export function PushToggle() {
  const [state, setState] = useState<"loading" | "on" | "off" | "blocked" | "unsupported" | "app">("loading");

  useEffect(() => {
    if (/MVMarketsApp/.test(navigator.userAgent)) return setState("app");
    if (!pushSupported()) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    pushEnabled().then((on) => setState(on ? "on" : "off"));
  }, []);

  const text: Record<typeof state, string> = {
    loading: "Checking…",
    on: "On for this device. You'll get new items, giveaways and app updates.",
    off: "Off for this device.",
    blocked: "Blocked in your browser settings. Allow notifications for this site there, then come back.",
    unsupported: "This browser can't show notifications. On iPhone, add MV Markets to your Home Screen first (see Get the app).",
    app: "Managed by the MV Markets app — use your phone's Settings → Apps → MV Markets → Notifications.",
  };

  return (
    <div className="card flex items-start gap-3 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
        {state === "on" ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">Phone notifications</h2>
        <p className="mt-0.5 text-sm text-slate-500">{text[state]}</p>
      </div>
      {(state === "on" || state === "off") && (
        <button
          type="button"
          className={state === "on" ? "btn-secondary btn-sm" : "btn-accent btn-sm"}
          onClick={async () => {
            setState("loading");
            if (state === "on") {
              await disablePush();
              setState("off");
            } else {
              const r = await enablePush();
              setState(r === "granted" ? "on" : r === "denied" ? "blocked" : r === "unsupported" ? "unsupported" : "off");
            }
          }}
        >
          {state === "on" ? "Turn off" : "Turn on"}
        </button>
      )}
    </div>
  );
}
