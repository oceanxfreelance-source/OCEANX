import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { joinGiveaway, giveawayLiveState, autoDrawIfDue, drawWinners, drawName } from "@/lib/services/giveaways";
import { runDailyMaintenance } from "@/lib/services/maintenance";
import { makeUser, resetSettings } from "./helpers";

beforeAll(resetSettings);

async function liveGiveaway(overrides: Record<string, unknown> = {}) {
  return prisma.giveaway.create({ data: { title: "Machine test", description: "", prize: "Phone", startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 60_000), status: "ACTIVE", ...overrides } });
}

describe("giveaway draw machine", () => {
  it("shows every participant on the reel, including new joiners", async () => {
    const g = await liveGiveaway();
    const a = await makeUser({ name: "Aisha Ibrahim" });
    const b = await makeUser({ name: "Hassan" });
    await joinGiveaway(g.id, a.id);
    let s = await giveawayLiveState(g.id, a.id);
    expect(s!.total).toBe(1);
    expect(s!.names).toEqual(["Aisha I."]);
    expect(s!.joined).toBe(true);
    await joinGiveaway(g.id, b.id);
    s = await giveawayLiveState(g.id, null);
    expect(s!.total).toBe(2);
    expect(s!.names).toContain("Hassan");
    expect(s!.status).toBe("ACTIVE");
    expect(s!.winners).toEqual([]);
  });

  it("draws automatically at the end time, exactly once even with many viewers", async () => {
    const g = await liveGiveaway({ winnersCount: 1 });
    const users = await Promise.all([1, 2, 3, 4].map(() => makeUser()));
    for (const u of users) await joinGiveaway(g.id, u.id);
    await prisma.giveaway.update({ where: { id: g.id }, data: { endsAt: new Date(Date.now() - 1000) } });

    // Ten viewers hit the live state at the same moment.
    const states = await Promise.all(Array.from({ length: 10 }, () => giveawayLiveState(g.id, null)));
    expect(states.every((s) => s!.status === "DRAWN")).toBe(true);
    expect(new Set(states.map((s) => s!.winners.join()))).toHaveProperty("size", 1);
    expect(await prisma.giveawayParticipant.count({ where: { giveawayId: g.id, isWinner: true } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: g.id, action: "giveaway.draw", actorId: null } })).toBe(1);
    const winner = await prisma.giveawayParticipant.findFirstOrThrow({ where: { giveawayId: g.id, isWinner: true } });
    expect(await prisma.notification.count({ where: { userId: winner.userId, type: "giveaway" } })).toBe(1);
    const mine = await giveawayLiveState(g.id, winner.userId);
    expect(mine!.youWon).toBe(true);
    await expect(drawWinners(g.id, null)).rejects.toThrow(/already/);
  });

  it("does not draw early, skips drafts, and the daily job draws anything missed", async () => {
    const early = await liveGiveaway();
    expect(await autoDrawIfDue(early.id)).toBe(false);
    const draft = await liveGiveaway({ status: "DRAFT", endsAt: new Date(Date.now() - 1000) });
    expect(await autoDrawIfDue(draft.id)).toBe(false);
    expect(await giveawayLiveState(draft.id, null)).toBeNull();
    const missed = await liveGiveaway({ endsAt: new Date(Date.now() - 1000) });
    const u = await makeUser();
    await prisma.giveawayParticipant.create({ data: { giveawayId: missed.id, userId: u.id } });
    await runDailyMaintenance();
    expect((await prisma.giveaway.findUniqueOrThrow({ where: { id: missed.id } })).status).toBe("DRAWN");
  });

  it("shows usernames when set, otherwise first name + initial", () => {
    expect(drawName({ name: "Mohamed Ali Rasheed", username: null })).toBe("Mohamed R.");
    expect(drawName({ name: "Aisha", username: null })).toBe("Aisha");
    expect(drawName({ name: "Ali", username: "ali_mv" })).toBe("ali_mv");
  });
});
