"use client";

import { useState } from "react";
import { CheckCircle2, Download, FolderDown, PlusSquare, Share, ShieldCheck, Smartphone } from "lucide-react";
import clsx from "clsx";
import { ANDROID_APK, useInstall, type Platform } from "./pwa";

type Step = { Icon: typeof Share; text: React.ReactNode };

const ANDROID_STEPS: Step[] = [
  { Icon: Download, text: <>Tap <b>Download for Android</b> above.</> },
  { Icon: FolderDown, text: <>When it finishes, tap <b>Open</b> (or open <b>MV-Markets.apk</b> from your notifications / Downloads).</> },
  { Icon: ShieldCheck, text: <>If Android asks, tap <b>Settings</b> and turn on <b>Allow from this source</b>, then go back. If Play Protect warns about an unknown app, tap <b>More details → Install anyway</b>.</> },
  { Icon: CheckCircle2, text: <>Tap <b>Install</b>, then <b>Open</b>. MV Markets is now in your apps.</> },
];

const IOS_STEPS: Step[] = [
  { Icon: Share, text: <>Open this page in <b>Safari</b> and tap the <b>Share</b> button (the square with an arrow).</> },
  { Icon: PlusSquare, text: <>Scroll down and tap <b>Add to Home Screen</b>.</> },
  { Icon: CheckCircle2, text: <>Tap <b>Add</b>. MV Markets appears on your home screen and opens full-screen like an app.</> },
];

const TABS: { key: Exclude<Platform, "desktop">; title: string }[] = [
  { key: "android", title: "Android" },
  { key: "ios", title: "iPhone & iPad" },
];

function DownloadButton({ big }: { big?: boolean }) {
  return (
    <a href={ANDROID_APK.url} download="MV-Markets.apk" className={clsx("btn-accent w-full", big && "h-14 text-base")}>
      <Download className="h-5 w-5" /> Download for Android
      <span className="font-normal opacity-80">· v{ANDROID_APK.version} · {ANDROID_APK.sizeKb} KB</span>
    </a>
  );
}

export function InstallGuide() {
  const { ready, platform, installed } = useInstall();
  const [tab, setTab] = useState<"android" | "ios" | null>(null);
  const shown = tab ?? (platform === "ios" ? "ios" : "android");

  if (ready && installed) {
    return (
      <div className="card flex items-center gap-3 p-5">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
        <p className="text-sm">You&apos;re already using the MV Markets app.</p>
      </div>
    );
  }

  const steps = shown === "android" ? ANDROID_STEPS : IOS_STEPS;

  return (
    <div className="space-y-5">
      {platform === "android" && <DownloadButton big />}
      {platform === "desktop" && (
        <p className="card flex items-start gap-3 p-4 text-sm text-slate-600">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-ocean-700" />
          <span>Open <b className="text-slate-900">this page on your phone</b> to install the app, or download the Android file here and send it to your phone.</span>
        </p>
      )}
      <div className="card p-5">
        <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
          {TABS.map(({ key, title }) => (
            <button key={key} type="button" role="tab" aria-selected={shown === key} onClick={() => setTab(key)} className={clsx("flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition", shown === key ? "bg-surface text-slate-900 shadow-sm" : "text-slate-500")}>
              {title}
            </button>
          ))}
        </div>
        {shown === "android" && platform !== "android" && (
          <div className="mb-4">
            <DownloadButton />
          </div>
        )}
        <ol className="space-y-4">
          {steps.map(({ Icon, text }, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ocean-50 text-ocean-700"><Icon className="h-5 w-5" /></span>
              <p className="pt-1.5 text-sm leading-relaxed text-slate-700"><span className="mr-1 font-semibold text-slate-900">{i + 1}.</span>{text}</p>
            </li>
          ))}
        </ol>
        {shown === "android" ? (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">This is the official MV Markets app from OceanX. The warning appears for any app that is not from the Play Store. Only install it from this page.</p>
        ) : (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">Apple only allows apps from outside the App Store to be added this way — there is no file to download on iPhone.</p>
        )}
      </div>
    </div>
  );
}
