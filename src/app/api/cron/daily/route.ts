import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runDailyMaintenance } from "@/lib/services/maintenance";

export const maxDuration = 300;

/** Called daily by Vercel Cron with "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runDailyMaintenance();
  return NextResponse.json({ ok: true, ...result });
}
