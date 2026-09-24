import { ZodError } from "zod";
import { unstable_rethrow } from "next/navigation";
import { UserError } from "./errors";
import { firstZodError } from "./validation";

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string>; data?: Record<string, unknown> } | null;

/**
 * Wraps a server action body: known user-facing errors become { error }, everything else is logged
 * and replaced with a generic message so internals never leak to the browser.
 * Next.js redirect()/notFound() errors are re-thrown so navigation still works.
 */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { error: e.message };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const k = issue.path.join(".");
        if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      return { error: firstZodError(e), fieldErrors };
    }
    console.error("[action] unexpected error", e);
    return { error: "Something went wrong. Please try again." };
  }
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function int(fd: FormData, key: string, fallback = 0): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
