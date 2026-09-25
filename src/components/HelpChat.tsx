"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, Headset, MessageCircleQuestion, Send, X } from "lucide-react";
import clsx from "clsx";

type Turn = { role: "user" | "assistant"; content: string };
type Msg = { id: string; sender: "USER" | "BOT" | "AGENT" | "SYSTEM"; body: string };
type Thread = { id: string; status: "WAITING" | "OPEN" | "CLOSED"; messages: Msg[] };

const STORE = "mvm-help-bot";
const WELCOME = "Hi! 👋 I'm the MV Markets assistant. Ask me anything about buying, selling, payments or the app — or tap “Talk to a person” to chat with our team.";
const SUGGESTIONS = ["How do I sell?", "How do I pay?", "How to mark as sold?", "Get the app", "How do giveaways work?"];

/** Floating help: a basic AI assistant, and "Talk to a person" for live chat with the OceanX team. */
export function HelpChat() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);
  const seen = useRef(0);
  const list = useRef<HTMLDivElement>(null);

  const agentMode = !!thread && thread.status !== "CLOSED";

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) || "[]");
      if (Array.isArray(saved)) setTurns(saved.slice(-30));
    } catch {}
    if (new URLSearchParams(window.location.search).get("help") === "1") setOpen(true);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-30)));
    } catch {}
  }, [turns]);

  const loadThread = useCallback(async () => {
    try {
      const r = await fetch("/api/support/thread", { cache: "no-store" });
      const j = await r.json();
      setLoggedIn(!!j.loggedIn);
      setThread(j.thread);
      if (j.thread) {
        const agentCount = j.thread.messages.filter((m: Msg) => m.sender === "AGENT").length;
        if (agentCount > seen.current && !open) setUnread(true);
        if (open) seen.current = agentCount;
      }
    } catch {}
  }, [open]);

  // Live chat polling: fast while open in team chat, slow in the background.
  useEffect(() => {
    if (path.startsWith("/admin")) return;
    loadThread();
    const t = setInterval(loadThread, open && agentMode ? 3000 : 25000);
    return () => clearInterval(t);
  }, [open, agentMode, loadThread, path]);

  useEffect(() => {
    if (open) setUnread(false);
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [open, turns, thread?.messages.length, busy]);

  if (path.startsWith("/admin") || path.startsWith("/sell") || /^\/messages\/.+/.test(path)) return null;

  const askBot = async (text: string) => {
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setBusy(true);
    try {
      const r = await fetch("/api/support/bot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) });
      const j = await r.json();
      setTurns([...next, { role: "assistant", content: j.text || j.error || "Sorry, something went wrong." }]);
    } catch {
      setTurns([...next, { role: "assistant", content: "I couldn't connect. Check your internet and try again." }]);
    } finally {
      setBusy(false);
    }
  };

  const threadCall = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/support/thread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (r.status === 401) setLoggedIn(false);
      if (!r.ok) setError(j.error || "Something went wrong.");
      else setThread(j.thread);
    } catch {
      setError("I couldn't connect. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    if (agentMode) await threadCall({ action: "send", threadId: thread!.id, body: t });
    else await askBot(t);
  };

  const talkToPerson = async () => {
    if (loggedIn === false) {
      setError("login");
      return;
    }
    await threadCall({ action: "request", transcript: turns });
  };

  const bubbles: { key: string; side: "me" | "them" | "system"; who?: string; text: string }[] = agentMode
    ? thread!.messages.map((m) => ({
        key: m.id,
        side: m.sender === "USER" ? "me" : m.sender === "SYSTEM" ? "system" : "them",
        who: m.sender === "AGENT" ? "MV Markets team" : m.sender === "BOT" ? "Assistant" : undefined,
        text: m.body,
      }))
    : [{ key: "welcome", side: "them" as const, who: "Assistant", text: WELCOME }, ...turns.map((t, i) => ({ key: String(i), side: t.role === "user" ? ("me" as const) : ("them" as const), who: t.role === "user" ? undefined : "Assistant", text: t.content }))];

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="help-fab fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-ocean-600 text-white shadow-xl shadow-ocean-900/30 transition hover:bg-ocean-700 md:bottom-6 md:right-6"
          aria-label="Help and support chat"
        >
          <MessageCircleQuestion className="h-6 w-6" />
          {unread && <span className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-coral-500" />}
        </button>
      )}

      {open && (
        <div className="help-panel fixed inset-0 z-50 flex flex-col bg-surface md:inset-auto md:bottom-6 md:right-6 md:h-[600px] md:max-h-[calc(100vh-3rem)] md:w-[380px] md:overflow-hidden md:rounded-2xl md:border md:border-slate-200 md:shadow-2xl" role="dialog" aria-label="Help chat">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-ink px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15">{agentMode ? <Headset className="h-5 w-5" /> : <Bot className="h-5 w-5" />}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{agentMode ? "MV Markets team" : "MV Markets Help"}</p>
              <p className="truncate text-xs text-white/70">
                {agentMode ? (thread!.status === "WAITING" ? "Waiting for someone from our team…" : "Connected — we'll reply here") : "Assistant · instant answers"}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10" aria-label="Close help">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={list} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-4">
            {bubbles.map((b) =>
              b.side === "system" ? (
                <p key={b.key} className="text-center text-[11px] text-slate-500">{b.text}</p>
              ) : (
                <div key={b.key} className={clsx("flex", b.side === "me" ? "justify-end" : "justify-start")}>
                  <div className={clsx("max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed", b.side === "me" ? "rounded-br-sm bg-ocean-600 text-white" : "rounded-bl-sm border border-slate-200 bg-surface text-slate-800")}>
                    {b.who && b.side === "them" && <span className="mb-0.5 block text-[11px] font-semibold text-ocean-700">{b.who}</span>}
                    {b.text}
                  </div>
                </div>
              ),
            )}
            {busy && !agentMode && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-2xl rounded-bl-sm border border-slate-200 bg-surface px-4 py-3">
                  {[0, 1, 2].map((i) => <span key={i} className="help-dot h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            )}
            {!agentMode && turns.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-ocean-200 bg-surface px-3 py-1.5 text-xs font-medium text-ocean-700 hover:bg-ocean-50">{s}</button>
                ))}
              </div>
            )}
            {error === "login" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Please log in so our team can reply to you.{" "}
                <Link href={`/login?next=${encodeURIComponent((path || "/") + "?help=1")}`} className="font-semibold underline">Log in</Link> or{" "}
                <Link href="/register" className="font-semibold underline">create an account</Link>.
              </div>
            ) : error ? (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {!agentMode && (
              <button type="button" onClick={talkToPerson} disabled={busy} className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <Headset className="h-4 w-4" /> Talk to a person
              </button>
            )}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder={agentMode ? "Write to our team…" : "Ask a question…"}
                className="input max-h-28 min-h-11 flex-1 resize-none"
                aria-label="Message"
              />
              <button type="submit" disabled={busy || !input.trim()} className="btn-accent h-11 w-11 shrink-0 px-0" aria-label="Send">
                <Send className="h-4 w-4" />
              </button>
            </form>
            {agentMode && (
              <button type="button" onClick={() => threadCall({ action: "close", threadId: thread!.id })} className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-800">
                End chat
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
