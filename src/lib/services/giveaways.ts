import { randomInt } from "crypto";
import { prisma } from "../db";
import { UserError, NotFoundError } from "../errors";
import { audit } from "../audit";
import { notify } from "../notify";
import { isVipActiveRecord } from "./vip";
import { hasPermission } from "../permissions";
import { pushToUsers } from "./push";

export async function joinGiveaway(giveawayId: string, userId: string) {
  const g = await prisma.giveaway.findUnique({ where: { id: giveawayId } });
  const now = new Date();
  if (!g || g.status !== "ACTIVE" || g.startsAt > now || g.endsAt < now) throw new UserError("This giveaway is not open.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { vipStatus: true, sellerStats: true } });
  if (!user.emailVerifiedAt || user.status !== "ACTIVE") throw new UserError("Verify your email to join giveaways.");
  if (g.vipOnly && !isVipActiveRecord(user.vipStatus)) throw new UserError("This giveaway is for VIP members only.");
  if ((user.sellerStats?.stars ?? 0) < g.minStars) throw new UserError(`You need at least ${g.minStars} Stars to join.`);
  await prisma.giveawayParticipant.upsert({ where: { giveawayId_userId: { giveawayId, userId } }, create: { giveawayId, userId }, update: {} });
}

/**
 * Cryptographically random, audited winner draw. Safe to call from many requests at once:
 * the giveaway is claimed atomically (only one caller flips it to DRAWN), so winners are picked exactly once.
 * adminId is null when the draw happens automatically at the end time.
 */
export async function drawWinners(giveawayId: string, adminId: string | null) {
  const g = await prisma.giveaway.findUnique({ where: { id: giveawayId } });
  if (!g) throw new NotFoundError();
  if (g.status === "DRAWN") throw new UserError("Winners were already drawn.");
  if (g.endsAt > new Date()) throw new UserError("The giveaway has not ended yet.");
  // Claim + pick + save in one transaction, so nobody ever sees "drawn" without its winners.
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.giveaway.updateMany({ where: { id: giveawayId, status: { in: ["ACTIVE", "ENDED"] } }, data: { status: "DRAWN" } });
    if (claimed.count === 0) return null;
    const participants = await tx.giveawayParticipant.findMany({ where: { giveawayId }, select: { userId: true } });
    const pool = participants.map((p) => p.userId);
    const picked: string[] = [];
    while (picked.length < g.winnersCount && pool.length > 0) picked.push(pool.splice(randomInt(0, pool.length), 1)[0]);
    if (picked.length) await tx.giveawayParticipant.updateMany({ where: { giveawayId, userId: { in: picked } }, data: { isWinner: true } });
    return { winners: picked, participants: participants.length };
  });
  if (!result) throw new UserError(g.status === "DRAFT" ? "This giveaway was never started." : "Winners were already drawn.");
  const { winners } = result;
  await audit({
    actorId: adminId,
    action: "giveaway.draw",
    entityType: "Giveaway",
    entityId: giveawayId,
    summary: `${adminId ? "Drew" : "Automatic draw at end time:"} ${winners.length} winner(s) from ${result.participants} participants`,
    metadata: { winners },
  });
  for (const w of winners) await notify(w, { type: "giveaway", title: "You won a giveaway 🎉", body: `Congratulations — you won "${g.title}" (${g.prize}). OceanX will contact you.`, link: "/giveaways" });
  await notifyAdminsOfWinners(g, winners);
  return winners;
}

/** Tell every admin who manages giveaways who won, with contact details, so they can reach the winner. */
async function notifyAdminsOfWinners(g: { id: string; title: string; prize: string }, winnerIds: string[]) {
  const admins = await prisma.user.findMany({ where: { adminRoleId: { not: null }, status: "ACTIVE" }, select: { id: true, adminRole: { select: { permissions: true } } } });
  const ids = admins.filter((a) => hasPermission(a.adminRole?.permissions, "giveaways")).map((a) => a.id);
  if (!ids.length) return;
  const people = await prisma.user.findMany({ where: { id: { in: winnerIds } }, select: { name: true, email: true, phone: true } });
  const who = people.length ? people.map((p) => `${p.name} (${[p.phone, p.email].filter(Boolean).join(", ")})`).join("; ") : "no participants — nobody won";
  const title = people.length ? `Giveaway winner: ${people.map((p) => p.name).join(", ")}` : `Giveaway ended without participants`;
  const body = `"${g.title}" (${g.prize}) — ${who}. Contact them from Admin → Giveaways.`;
  const link = `/admin/giveaways#g-${g.id}`;
  for (const id of ids) await notify(id, { type: "giveaway", title, body, link });
  await pushToUsers(ids, { title, body: body.slice(0, 200), url: link, tag: `winner-${g.id}` }).catch(() => undefined);
}

/** Draw automatically once the end time has passed (called by the live view and the daily job). Returns true if it drew now. */
export async function autoDrawIfDue(giveawayId: string, now = new Date()) {
  const g = await prisma.giveaway.findUnique({ where: { id: giveawayId }, select: { status: true, endsAt: true } });
  if (!g || (g.status !== "ACTIVE" && g.status !== "ENDED") || g.endsAt > now) return false;
  try {
    await drawWinners(giveawayId, null);
    return true;
  } catch (e) {
    if (e instanceof UserError) return false; // someone else drew it a moment ago
    throw e;
  }
}

/** Public display name in the draw machine: username if set, else first name + last initial. */
export function drawName(u: { name: string; username: string | null }) {
  if (u.username) return u.username;
  const parts = u.name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

/** Everything the draw machine needs: names on the reel, count, timing and (once drawn) the winners. */
export async function giveawayLiveState(giveawayId: string, viewerId: string | null) {
  await autoDrawIfDue(giveawayId);
  const g = await prisma.giveaway.findUnique({ where: { id: giveawayId }, select: { id: true, status: true, startsAt: true, endsAt: true, winnersCount: true } });
  if (!g || g.status === "DRAFT") return null;
  const [total, recent, winners, mine] = await Promise.all([
    prisma.giveawayParticipant.count({ where: { giveawayId } }),
    prisma.giveawayParticipant.findMany({ where: { giveawayId }, orderBy: { joinedAt: "desc" }, take: 300, select: { user: { select: { name: true, username: true } } } }),
    g.status === "DRAWN"
      ? prisma.giveawayParticipant.findMany({ where: { giveawayId, isWinner: true }, select: { userId: true, user: { select: { name: true, username: true } } } })
      : Promise.resolve([]),
    viewerId ? prisma.giveawayParticipant.findUnique({ where: { giveawayId_userId: { giveawayId, userId: viewerId } }, select: { isWinner: true } }) : Promise.resolve(null),
  ]);
  return {
    id: g.id,
    status: g.status,
    startsAt: g.startsAt.toISOString(),
    endsAt: g.endsAt.toISOString(),
    now: new Date().toISOString(),
    total,
    names: recent.map((p) => drawName(p.user)),
    winners: winners.map((w) => drawName(w.user)),
    joined: !!mine,
    youWon: !!mine?.isWinner,
  };
}

/** Permanently remove a giveaway and its entries (audited). */
export async function deleteGiveaway(giveawayId: string, adminId: string) {
  const g = await prisma.giveaway.findUnique({ where: { id: giveawayId }, include: { _count: { select: { participants: true } } } });
  if (!g) throw new NotFoundError();
  await prisma.giveaway.delete({ where: { id: giveawayId } });
  await audit({ actorId: adminId, action: "giveaway.delete", entityType: "Giveaway", entityId: giveawayId, summary: `Deleted "${g.title}" (${g._count.participants} participants, status ${g.status})` });
}
