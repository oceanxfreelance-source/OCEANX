import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { prisma } from "../db";
import { hashIp, randomToken, sha256 } from "../crypto";
import { env } from "../env";

export const SESSION_COOKIE = env.isProd ? "__Host-mvm_session" : "mvm_session";
const SESSION_DAYS = 30;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export async function clientIpHash() {
  return hashIp(await clientIp());
}

export async function createSession(userId: string, opts: { mfaVerified?: boolean } = {}) {
  const token = randomToken(32);
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await prisma.session.create({
    data: { id: sha256(token), userId, mfaVerified: !!opts.mfaVerified, expiresAt, ipHash: await clientIpHash(), userAgent: h.get("user-agent")?.slice(0, 200) ?? null },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/", expires: expiresAt });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function markSessionMfaVerified() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.update({ where: { id: sha256(token) }, data: { mfaVerified: true } });
}

/** Current session + user, memoised per request. Returns null for anonymous / expired / suspended. */
export const getSession = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { include: { adminRole: true, profile: true, vipStatus: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    const now = new Date();
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => undefined);
    await prisma.user.update({ where: { id: session.userId }, data: { lastActiveAt: now } }).catch(() => undefined);
  }
  return session;
});

export async function getCurrentUser() {
  return (await getSession())?.user ?? null;
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
