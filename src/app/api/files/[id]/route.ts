import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readFileBytes } from "@/lib/storage";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const file = await prisma.storedFile.findUnique({ where: { id } });
  if (!file) return new NextResponse("Not found", { status: 404 });

  if (file.visibility === "PRIVATE") {
    // Private files (payment slips): only the uploader or an admin with payment/finance access.
    const session = await getSession();
    const perms = session?.mfaVerified ? session.user.adminRole?.permissions : null;
    const allowed = !!session && (session.userId === file.ownerId || hasPermission(perms, "payments") || hasPermission(perms, "finance"));
    if (!allowed) return new NextResponse("Not found", { status: 404 });
  }

  const bytes = await readFileBytes(file);
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": file.visibility === "PUBLIC" ? "public, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
