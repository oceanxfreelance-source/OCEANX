"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type W = Window & { __mvmInstall?: BIPEvent | null };

export type Platform = "ios" | "android" | "desktop";

/** The Android app file hosted on this site (built from /android). */
export const ANDROID_APK = { url: "/downloads/mv-markets.apk", version: "1.0", sizeKb: 88 };

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function isStandalone() {
  if (/MVMarketsApp/.test(navigator.userAgent)) return true;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Registers the service worker and keeps Android/desktop Chrome's install prompt for later. */
export function PwaSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const w = window as W;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      w.__mvmInstall = e as BIPEvent;
      window.dispatchEvent(new Event("mvm-install-ready"));
    };
    const onInstalled = () => {
      w.__mvmInstall = null;
      window.dispatchEvent(new Event("mvm-install-ready"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

/** State for install buttons: which platform, whether a one-tap install is available, and whether we're already the app. */
export function useInstall() {
  const [state, setState] = useState<{ ready: boolean; platform: Platform; canPrompt: boolean; installed: boolean }>({ ready: false, platform: "desktop", canPrompt: false, installed: false });
  useEffect(() => {
    const update = () => setState({ ready: true, platform: detectPlatform(), canPrompt: !!(window as W).__mvmInstall, installed: isStandalone() });
    update();
    window.addEventListener("mvm-install-ready", update);
    return () => window.removeEventListener("mvm-install-ready", update);
  }, []);

  const install = async (): Promise<boolean> => {
    const e = (window as W).__mvmInstall;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    (window as W).__mvmInstall = null;
    setState((s) => ({ ...s, canPrompt: false, installed: outcome === "accepted" }));
    return outcome === "accepted";
  };

  return { ...state, install };
}
