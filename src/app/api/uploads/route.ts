import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { processImage, MAX_UPLOAD_BYTES } from "@/lib/images";
import { saveFile, fileUrl } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/request-guard";
import { UserError } from "@/lib/errors";

const PURPOSES: Record<string, { maxSize: number }> = {
  listing_image: { maxSize: 1600 },
  avatar: { maxSize: 400 },
  business_logo: { maxSize: 512 },
  business_banner: { maxSize: 1920 },
};

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  if (!session.user.emailVerifiedAt) return NextResponse.json({ error: "Please verify your email first." }, { status: 403 });
  if (!(await rateLimit(`upload:${session.userId}`, 80, 3600))) return NextResponse.json({ error: "Too many uploads. Please wait a while." }, { status: 429 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const purpose = String(form.get("purpose") ?? "listing_image");
  const cfg = PURPOSES[purpose];
  const file = form.get("file");
  if (!cfg || !(file instanceof File)) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Image is too large (max 4 MB)." }, { status: 413 });

  try {
    const img = await processImage(Buffer.from(await file.arrayBuffer()), { maxSize: cfg.maxSize });
    const saved = await saveFile({ buffer: img.buffer, mimeType: img.mimeType, visibility: "PUBLIC", purpose, ownerId: session.userId, width: img.width, height: img.height });
    return NextResponse.json({ id: saved.id, url: fileUrl(saved.id) });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[upload]", e);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
