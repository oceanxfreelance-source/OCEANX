import { FileVisibility } from "@prisma/client";
import { prisma, type Tx } from "./db";
import { sha256 } from "./crypto";
import { env } from "./env";

/**
 * File storage with two drivers:
 *  - "database" (default): bytes stored in Postgres. Zero extra infrastructure, works on Vercel.
 *  - "s3": any S3-compatible bucket (AWS S3, Cloudflare R2, Supabase Storage...). Bucket should be PRIVATE;
 *    all files are streamed through /api/files/[id] which enforces access control.
 */

type SaveInput = {
  buffer: Buffer;
  mimeType: string;
  visibility: FileVisibility;
  purpose: string;
  ownerId?: string | null;
  width?: number;
  height?: number;
  sha?: string;
};

async function s3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
}

export async function saveFile(input: SaveInput, db: Tx = prisma) {
  const hash = input.sha ?? sha256(input.buffer);
  if (env.storageDriver === "s3") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const key = `${input.visibility.toLowerCase()}/${input.purpose}/${Date.now()}-${hash.slice(0, 16)}`;
    const client = await s3Client();
    await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: input.buffer, ContentType: input.mimeType }));
    return db.storedFile.create({
      data: { ownerId: input.ownerId ?? null, visibility: input.visibility, purpose: input.purpose, mimeType: input.mimeType, size: input.buffer.length, width: input.width, height: input.height, sha256: hash, storageKey: key },
      select: { id: true, sha256: true },
    });
  }
  return db.storedFile.create({
    data: { ownerId: input.ownerId ?? null, visibility: input.visibility, purpose: input.purpose, mimeType: input.mimeType, size: input.buffer.length, width: input.width, height: input.height, sha256: hash, data: new Uint8Array(input.buffer) },
    select: { id: true, sha256: true },
  });
}

export async function readFileBytes(file: { data: Uint8Array | null; storageKey: string | null }): Promise<Buffer | null> {
  if (file.data) return Buffer.from(file.data);
  if (file.storageKey) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    const out = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: file.storageKey }));
    const bytes = await out.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  }
  return null;
}

export async function deleteFile(id: string) {
  const f = await prisma.storedFile.findUnique({ where: { id }, select: { storageKey: true } });
  if (!f) return;
  if (f.storageKey) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: f.storageKey })).catch(() => undefined);
  }
  await prisma.storedFile.delete({ where: { id } }).catch(() => undefined);
}

export function fileUrl(id: string | null | undefined): string | null {
  return id ? `/api/files/${id}` : null;
}
