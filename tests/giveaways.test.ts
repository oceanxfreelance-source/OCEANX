import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { deleteGiveaway, joinGiveaway } from "@/lib/services/giveaways";
import { makeUser, resetSettings } from "./helpers";

beforeAll(resetSettings);

describe("giveaway deletion", () => {
  it("removes the giveaway and its entries and writes an audit record", async () => {
    const admin = await makeUser({ admin: true });
    const u = await makeUser();
    const g = await prisma.giveaway.create({ data: { title: "Delete me", description: "x", prize: "Prize", startsAt: new Date(Date.now() - 3600e3), endsAt: new Date(Date.now() + 86400e3), status: "ACTIVE" } });
    await joinGiveaway(g.id, u.id);
    expect(await prisma.giveawayParticipant.count({ where: { giveawayId: g.id } })).toBe(1);

    await deleteGiveaway(g.id, admin.id);
    expect(await prisma.giveaway.findUnique({ where: { id: g.id } })).toBeNull();
    expect(await prisma.giveawayParticipant.count({ where: { giveawayId: g.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "giveaway.delete", entityId: g.id, actorId: admin.id } })).toBe(1);
    await expect(deleteGiveaway(g.id, admin.id)).rejects.toThrow();
  });
});
