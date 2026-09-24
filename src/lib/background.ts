import { after } from "next/server";

/**
 * Run work after the response is sent (inside a request), or right away otherwise (scripts, tests, cron).
 * Returns a promise only in the second case so callers can await it there.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): Promise<void> | undefined {
  const safe = async () => {
    try {
      await task();
    } catch (e) {
      console.error(`[${label}]`, e);
    }
  };
  try {
    after(safe);
    return undefined;
  } catch {
    return safe();
  }
}
