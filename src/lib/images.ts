import sharp from "sharp";
import { UserError } from "./errors";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel serverless request body limit is 4.5 MB
const ALLOWED_IMAGE_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif"]);

export type ProcessedImage = { buffer: Buffer; mimeType: string; width: number; height: number };

/**
 * Validates an uploaded image by decoding it (never trusting the declared MIME type),
 * auto-rotates using EXIF, strips all metadata (including GPS), resizes and re-encodes to WebP.
 */
export async function processImage(input: Buffer, opts: { maxSize?: number; quality?: number } = {}): Promise<ProcessedImage> {
  if (input.length === 0) throw new UserError("The file is empty.");
  if (input.length > MAX_UPLOAD_BYTES) throw new UserError("Image is too large (max 4 MB).");
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new UserError("This file is not a supported image.");
  }
  if (!meta.format || !ALLOWED_IMAGE_FORMATS.has(meta.format)) throw new UserError("Unsupported image format. Use JPG, PNG or WebP.");
  const maxSize = opts.maxSize ?? 1600;
  const { data, info } = await sharp(input, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .webp({ quality: opts.quality ?? 80 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, mimeType: "image/webp", width: info.width, height: info.height };
}

/** 64-bit difference hash, used to spot re-encoded / resized copies of the same payment slip. */
export async function perceptualHash(input: Buffer): Promise<string | null> {
  try {
    const { data } = await sharp(input).rotate().grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
    let bits = "";
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? "1" : "0";
    return BigInt("0b" + bits).toString(16).padStart(16, "0");
  } catch {
    return null;
  }
}

export function hammingDistanceHex(a: string, b: string): number {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

export function isPdf(buf: Buffer) {
  return buf.length > 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-";
}
