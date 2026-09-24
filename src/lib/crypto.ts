import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { env } from "./env";

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmac(input: string): string {
  return createHmac("sha256", env.authSecret).update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomDigits(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += randomInt(0, 10).toString();
  return out;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** One-way hash for IP addresses so we can detect abuse without storing raw IPs. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return hmac(`ip:${ip}`).slice(0, 32);
}

export function referralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[randomInt(0, alphabet.length)];
  return out;
}
