"use client";

import { useState } from "react";
import { CheckCircle2, Download, EllipsisVertical, PlusSquare, Share, Smartphone } from "lucide-react";
import clsx from "clsx";
import { useInstall, type Platform } from "./pwa";

const STEPS: Record<Platform, { title: string; steps: { Icon: typeof Share; text: React.ReactNode }[] }> = {
  ios: {
    title: "iPhone & iPad",
    steps: [
      { Icon: Share, text: <>Open this page in <b>Safari</b> and tap the <b>Share</b> button (the square with an arrow).</> },
      { Icon: PlusSquare, text: <>Scroll down and tap <b>Add to Home Screen</b>.</> },
      { Icon: CheckCircle2, text: <>Tap <b>Add</b>. MV Markets appears on your home screen like any other app.</> },
    ],
  },
  android: {
    title: "Android",
    steps: [
      { Icon: EllipsisVertical, text: <>Open this page in <b>Chrome</b> and tap the <b>⋮ menu</b> at the top right.</> },
      { Icon: Download, text: <>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</> },
      { Icon: CheckCircle2, text: <>Tap <b>Install</b>. MV Markets appears in your apps.</> },
    ],
  },
  desktop: {
    title: "Computer",
    steps: [
      { Icon: Download, text: <>In Chrome or Edge, click the <b>install icon</b> at the right end of the address bar.</> },
      { Icon: CheckCircle2, text: <>Click <b>Install</b>. MV Markets opens in its own window.</> },
    ],
  },
};

export function InstallGuide() {
  const { ready, platform, canPrompt, installed, install } = useInstall();
  const [tab, setTab] = useState<Platform | null>(null);
  const [done, setDone] = useState(false);
  const shown = tab ?? platform;

  if (ready && (installed || done)) {
    return (
      <div className="card flex items-center gap-3 p-5">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
        <p className="text-sm">{installed ? "You're using the MV Markets app." : "Installed! Find MV Markets on your home screen."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {canPrompt && (
        <button type="button" onClick={async () => setDone(await install())} className="btn-accent h-14 w-full text-base">
          <Download className="h-5 w-5" /> Install the app
        </button>
      )}
      <div className="card p-5">
        <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
          {(["ios", "android", "desktop"] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={shown === p} onClick={() => setTab(p)} className={clsx("flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition", shown === p ? "bg-surface text-slate-900 shadow-sm" : "text-slate-500")}>
              {STEPS[p].title}
            </button>
          ))}
        </div>
        <ol className="space-y-4">
          {STEPS[shown].steps.map(({ Icon, text }, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ocean-50 text-ocean-700"><Icon className="h-5 w-5" /></span>
              <p className="pt-1.5 text-sm leading-relaxed text-slate-700"><span className="mr-1 font-semibold text-slate-900">{i + 1}.</span>{text}</p>
            </li>
          ))}
        </ol>
        {shown === "ios" && <p className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"><Smartphone className="h-4 w-4 shrink-0" /> Apple only allows this through Safari&apos;s Share menu. There is nothing to download.</p>}
      </div>
    </div>
  );
}
