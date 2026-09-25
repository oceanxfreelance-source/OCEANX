"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PartyPopper, Timer, Users } from "lucide-react";

export type LiveState = {
  id: string;
  status: "ACTIVE" | "ENDED" | "DRAWN" | "DRAFT";
  startsAt: string;
  endsAt: string;
  now: string;
  total: number;
  names: string[];
  winners: string[];
  joined: boolean;
  youWon: boolean;
};

const ROW = 56; // px per name row
const VISIBLE = 5; // rows shown (the middle one is the "hit" line)
const SPEED = 16; // names per second while rolling
const LAND_SECONDS = 4.5;

function fmt(ms: number) {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${p(h)}:${p(m)}:${p(sec)}` : `${p(h)}:${p(m)}:${p(sec)}`;
}

function shuffle<T>(a: T[]) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/**
 * Slot-machine style draw: every participant's name rolls past very fast; new joiners are added live.
 * When the end time arrives the server draws the winner (cryptographically random, audited) and the
 * reel slows down and stops on that name. The animation only ever *shows* the server's result.
 */
export function GiveawayMachine({ initial }: { initial: LiveState }) {
  const [state, setState] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const skew = useRef(new Date(initial.now).getTime() - Date.now());
  const names = useRef<string[]>(shuffle(initial.names));
  const offset = useRef(0);
  const landing = useRef<{ from: number; to: number; start: number; winner: string } | null>(
    initial.status === "DRAWN" && initial.winners[0] ? { from: 0, to: 0, start: 0, winner: initial.winners[0] } : null,
  );
  const [landed, setLanded] = useState(initial.status === "DRAWN");
  const reel = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);

  const serverNow = now + skew.current;
  const startsAt = new Date(state.startsAt).getTime();
  const endsAt = new Date(state.endsAt).getTime();
  const upcoming = serverNow < startsAt;
  const running = !upcoming && state.status !== "DRAWN";

  // Poll the live state: every 4s, every 1s near/after the end until the winner is known.
  useEffect(() => {
    if (state.status === "DRAWN") return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/giveaways/${state.id}/live`, { cache: "no-store" });
        if (r.ok && !stop) {
          const next = (await r.json()) as LiveState;
          skew.current = new Date(next.now).getTime() - Date.now();
          const known = new Set(names.current);
          const fresh = next.names.filter((n) => !known.has(n));
          if (fresh.length) {
            // New joiners jump into the reel right away.
            const at = Math.floor(offset.current) % Math.max(names.current.length, 1);
            names.current.splice(at + 3, 0, ...fresh);
          }
          setState(next);
        }
      } catch {}
    };
    const remaining = endsAt - (Date.now() + skew.current);
    const t = setInterval(tick, remaining < 20_000 ? 1000 : 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [state.id, state.status, endsAt, now > endsAt - 20_000]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the draw result arrives, schedule the slow-down onto the winner.
  useEffect(() => {
    if (state.status !== "DRAWN" || landing.current) return;
    const winner = state.winners[0];
    if (!winner) {
      setLanded(true);
      return;
    }
    const from = offset.current;
    const to = Math.ceil(from + (SPEED * LAND_SECONDS) / 3) + 2;
    landing.current = { from, to, start: performance.now(), winner };
  }, [state.status, state.winners]);

  // Animation loop (writes straight to the DOM for smooth 60fps).
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nameAt = (i: number) => {
      const L = landing.current;
      if (L && i === L.to) return L.winner;
      const list = names.current;
      if (!list.length) return i % 2 ? "Join now!" : "Could be you";
      return list[((i % list.length) + list.length) % list.length];
    };
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const L = landing.current;
      if (L) {
        if (L.start === 0 || reduce) {
          offset.current = L.to;
        } else {
          const p = Math.min(1, (t - L.start) / (LAND_SECONDS * 1000));
          offset.current = L.from + (L.to - L.from) * (1 - Math.pow(1 - p, 3));
          if (p >= 1 && !landed) setLanded(true);
        }
      } else if (running && !reduce) {
        offset.current += SPEED * dt;
      }
      const base = Math.floor(offset.current);
      const frac = offset.current - base;
      if (reel.current) reel.current.style.transform = `translateY(${-frac * ROW}px)`;
      const half = Math.floor(VISIBLE / 2);
      rows.current.forEach((el, k) => {
        if (!el) return;
        const idx = base + k - half;
        el.textContent = nameAt(idx);
        const dist = Math.abs(k - half - frac);
        el.style.opacity = String(Math.max(0.15, 1 - dist * 0.38));
        el.style.transform = `scale(${1 - Math.min(dist, 2) * 0.1})`;
        el.style.filter = !L && running && !reduce ? `blur(${Math.min(1.6, dist * 0.6 + 0.4)}px)` : "none";
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, landed]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const confetti = useMemo(
    () => Array.from({ length: 36 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 0.6, dur: 1.6 + Math.random() * 1.4, hue: [199, 45, 330, 145, 265][i % 5], rot: Math.random() * 360 })),
    [],
  );

  const drawn = state.status === "DRAWN";
  return (
    <div className="gw-machine relative overflow-hidden rounded-2xl p-4 text-white" aria-live="polite">
      {/* status line */}
      <div className="relative flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wider text-white/80">
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${drawn ? "bg-amber-300" : upcoming ? "bg-white/50" : "animate-pulse bg-emerald-400"}`} />
          {drawn ? "Winner drawn" : upcoming ? "Starting soon" : "Live draw"}
        </span>
        <span className="inline-flex items-center gap-1.5 normal-case tracking-normal"><Users className="h-3.5 w-3.5" /> {state.total} joined</span>
      </div>

      {/* reel */}
      <div className="relative mx-auto mt-3 overflow-hidden rounded-xl bg-black/35 ring-1 ring-white/15" style={{ height: ROW * VISIBLE }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-2 z-10 rounded-lg ring-2 ring-amber-300/80 shadow-[0_0_30px_rgba(252,211,77,.35)]" style={{ top: ROW * Math.floor(VISIBLE / 2), height: ROW }} />
        <div ref={reel}>
          {Array.from({ length: VISIBLE + 1 }, (_, k) => (
            <div
              key={k}
              ref={(el) => {
                rows.current[k] = el;
              }}
              className="grid place-items-center truncate px-4 text-center text-2xl font-bold tracking-tight will-change-transform"
              style={{ height: ROW }}
            />
          ))}
        </div>
        {landed && drawn && (
          <div className="pointer-events-none absolute inset-0 z-20">
            {confetti.map((c, i) => (
              <span key={i} className="gw-confetti" style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, background: `hsl(${c.hue} 90% 60%)`, transform: `rotate(${c.rot}deg)` }} />
            ))}
          </div>
        )}
      </div>

      {/* footer: countdown or winners */}
      <div className="relative mt-3 text-center">
        {drawn ? (
          landed ? (
            state.winners.length ? (
              <div>
                <p className="flex items-center justify-center gap-2 text-lg font-bold"><PartyPopper className="h-5 w-5 text-amber-300" /> {state.winners.length > 1 ? "Winners" : "Winner"}: {state.winners.join(", ")}</p>
                {state.youWon && <p className="mt-1 text-sm font-semibold text-amber-200">That&apos;s you — congratulations! OceanX will contact you.</p>}
              </div>
            ) : (
              <p className="text-sm text-white/80">This giveaway ended with no participants.</p>
            )
          ) : (
            <p className="text-sm font-semibold text-white/90">Drawing the winner…</p>
          )
        ) : (
          <p className="inline-flex items-center gap-2 font-mono text-lg font-bold tabular-nums" suppressHydrationWarning>
            <Timer className="h-4 w-4" /> {upcoming ? `Starts in ${fmt(startsAt - serverNow)}` : serverNow >= endsAt ? "Drawing the winner…" : `Ends in ${fmt(endsAt - serverNow)}`}
          </p>
        )}
      </div>
    </div>
  );
}
