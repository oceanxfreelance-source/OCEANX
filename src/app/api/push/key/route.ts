import { NextResponse } from "next/server";
import { getVapidKeys } from "@/lib/services/push";

export async function GET() {
  const { publicKey } = await getVapidKeys();
  return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
