"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import clsx from "clsx";

type Msg = { id: string; sender: "USER" | "BOT" | "AGENT" | "SYSTEM"; body: string; createdAt: string };
type Thread = { id: string; status: "WAITING" | "OPEN" | "CLOSED"; messages: Msg[] };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Maldives" });

/** Admin side of a live help chat: new customer messages appear within a few seconds. */
export function AgentChat({ initial, customerName }: { initial: Thread; customerName: string }) {
  const [t, setT] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch(`/api/admin/support/${t.id}`, { cache: "no-store" });
        if (r.ok) setT(await r.json());
      } catch {}
    };
    const i = setInterval(tick, 3000);
    return () => clearInterval(i);
  }, [t.id]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [t.messages.length]);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/support/${t.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) setError(j.error || "Could not send.");
      else setT(j);
    } catch {
      setError("Could not send. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    await post({ body });
  };

  return (
    <div className="card flex h-[70vh] flex-col overflow-hidden">
      <div ref={box} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
        {t.messages.map((m) =>
          m.sender === "SYSTEM" ? (
            <p key={m.id} className="text-center text-xs text-slate-500">{m.body} · {time(m.createdAt)}</p>
          ) : (
            <div key={m.id} className={clsx("flex", m.sender === "AGENT" ? "justify-end" : "justify-start")}>
              <div className={clsx("max-w-[75%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm", m.sender === "AGENT" ? "rounded-br-sm bg-ocean-600 text-white" : m.sender === "BOT" ? "rounded-bl-sm border border-dashed border-slate-300 bg-surface text-slate-600" : "rounded-bl-sm border border-slate-200 bg-surface text-slate-800")}>
                <span className={clsx("mb-0.5 block text-[11px] font-semibold", m.sender === "AGENT" ? "text-white/80" : "text-ocean-700")}>
                  {m.sender === "AGENT" ? "You (team)" : m.sender === "BOT" ? "Assistant (automatic)" : customerName} · {time(m.createdAt)}
                </span>
                {m.body}
              </div>
            </div>
          ),
        )}
      </div>
      {t.status === "CLOSED" ? (
        <p className="border-t border-slate-200 p-4 text-center text-sm text-slate-500">This chat is closed. Replying will reopen it.</p>
      ) : null}
      <div className="border-t border-slate-200 bg-surface p-3">
        {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={`Reply to ${customerName}…`}
            className="input flex-1 resize-none"
          />
          <button type="button" onClick={send} disabled={busy || !text.trim()} className="btn-accent h-11 px-4"><Send className="h-4 w-4" /> Send</button>
        </div>
        {t.status !== "CLOSED" && (
          <button type="button" onClick={() => post({ action: "close" })} disabled={busy} className="mt-2 text-xs text-slate-500 hover:text-slate-800">Close chat</button>
        )}
      </div>
    </div>
  );
}
