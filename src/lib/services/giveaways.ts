import { randomInt } from "crypto";
import { prisma } from "../db";
import { UserError, NotFoundError } from "../errors";
import { audit } from "../audit";
import { notify } from "../notify";
import { isVipActiveRecord } from "./vip";

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

/** Cryptographically random, audited winner draw. */
export async function drawWinners(giveawayId: string, adminId: string) {
  const g = await prisma.giveaway.findUnique({ where: { id: giveawayId }, include: { participants: true } });
  if (!g) throw new NotFoundError();
  if (g.status === "DRAWN") throw new UserError("Winners were already drawn.");
  if (g.endsAt > new Date()) throw new UserError("The giveaway has not ended yet.");
  const pool = g.participants.filter((p) => !p.isWinner).map((p) => p.userId);
  const winners: string[] = [];
  while (winners.length < g.winnersCount && pool.length > 0) winners.push(pool.splice(randomInt(0, pool.length), 1)[0]);
  await prisma.$transaction([
    prisma.giveawayParticipant.updateMany({ where: { giveawayId, userId: { in: winners } }, data: { isWinner: true } }),
    prisma.giveaway.update({ where: { id: giveawayId }, data: { status: "DRAWN" } }),
  ]);
  await audit({ actorId: adminId, action: "giveaway.draw", entityType: "Giveaway", entityId: giveawayId, summary: `Drew ${winners.length} winner(s) from ${g.participants.length} participants`, metadata: { winners } });
  for (const w of winners) await notify(w, { type: "giveaway", title: "You won! 🎉", body: `Congratulations — you won "${g.title}" (${g.prize}). OceanX will contact you.`, link: "/giveaways" });
  return winners;
}
