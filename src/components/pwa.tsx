"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type W = Window & { __mvmInstall?: BIPEvent | null };

export type Platform = "ios" | "android" | "desktop";

/** The Android app file hosted on this site (built from /android). */
export const ANDROID_APK = { url: "/downloads/mv-markets.apk", version: "1.1", sizeKb: 92 };

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
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("/sw.js").then(() => resyncPush()).catch(() => undefined);
    }
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

// ─────────── Push notifications ───────────

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function saveOnServer(sub: PushSubscription) {
  await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
}

/** Ask the phone for permission (must be called from a tap) and subscribe. Returns the final permission. */
export async function enablePush(): Promise<NotificationPermission | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { publicKey } = await (await fetch("/api/push/key")).json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
    }
    await saveOnServer(sub);
  } catch (e) {
    // e.g. the browser's push service is unavailable; notifications simply stay off.
    console.warn("[push] could not subscribe", e);
    return "unsupported";
  }
  return permission;
}

export async function disablePush() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    await sub.unsubscribe();
  } catch (e) {
    console.warn("[push] could not unsubscribe", e);
  }
}

export async function pushEnabled() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

/** Keep the server copy in sync (e.g. after logging in, so notifications follow the account). */
async function resyncPush() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await saveOnServer(sub);
  } catch {}
}
