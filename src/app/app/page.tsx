import type { Metadata } from "next";
import { Bell, Download, Zap, Maximize } from "lucide-react";
import { getSiteSettings } from "@/lib/site";
import { InstallGuide } from "@/components/InstallGuide";

export const metadata: Metadata = {
  title: "Get the app",
  description: "Install MV Markets on your Android phone or iPhone, straight from the website — no app store needed.",
  alternates: { canonical: "/app" },
};

export default async function GetAppPage() {
  const s = await getSiteSettings();
  return (
    <div className="mx-auto max-w-lg space-y-6 py-2">
      <div className="bg-grid relative overflow-hidden rounded-2xl bg-slate-950 p-6 text-white">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-ocean-500/30 blur-3xl" />
        <div className="relative flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="h-16 w-16 rounded-2xl shadow-lg shadow-black/40" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Get the {s.general.marketplaceName} app</h1>
            <p className="mt-1 text-sm text-white/75">Free · Android & iPhone · no app store needed</p>
          </div>
        </div>
        <ul className="relative mt-6 grid grid-cols-3 gap-3 text-center text-xs text-white/80">
          <li className="rounded-xl bg-white/5 p-3"><Maximize className="mx-auto mb-1.5 h-5 w-5 text-ocean-200" />Full screen</li>
          <li className="rounded-xl bg-white/5 p-3"><Zap className="mx-auto mb-1.5 h-5 w-5 text-ocean-200" />Opens instantly</li>
          <li className="rounded-xl bg-white/5 p-3"><Download className="mx-auto mb-1.5 h-5 w-5 text-ocean-200" />Tiny, always up to date</li>
        </ul>
      </div>
      <InstallGuide />
      <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <Bell className="mt-0.5 h-4 w-4 shrink-0" /> The app is the same MV Markets you use here, so your account, listings and chats are all there. It updates itself — you never need to download a new version.
      </p>
    </div>
  );
}
