import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { startConversation, sendMessage, getConversationForUser, listConversations, unreadMessageCount } from "@/lib/services/messaging";
import { createReport, adminHandleReport } from "@/lib/services/reports";
import { joinGiveaway, drawWinners } from "@/lib/services/giveaways";
import { suspendUser, setUserAdminRole } from "@/lib/services/admin-users";
import { revenueDashboard, marketplaceStats } from "@/lib/services/analytics";
import { hasPermission } from "@/lib/permissions";
import { normalizePhone, cleanText } from "@/lib/validation";
import { formatMVR, mvrToLaari } from "@/lib/money";
import { addMonths } from "@/lib/dates";
import { rateLimit } from "@/lib/rate-limit";
import { updateSettingsGroup, getSettings } from "@/lib/settings";
import { makeUser, publishedListing, resetSettings } from "./helpers";

beforeAll(resetSettings);

describe("messaging", () => {
  it("buyer messages seller; only participants can read; unread counts", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const snoop = await makeUser();
    const l = await publishedListing(seller.id);
    const conv = await startConversation(buyer.id, l.id, "Hi, is this still available?");
    await expect(startConversation(seller.id, l.id, "hi")).rejects.toThrow(/own listing/);
    expect(await unreadMessageCount(seller.id)).toBe(1);
    await expect(getConversationForUser(conv.id, snoop.id)).rejects.toThrow();
    await expect(sendMessage(conv.id, snoop.id, "hi")).rejects.toThrow();
    const c = await getConversationForUser(conv.id, seller.id);
    expect(c.messages).toHaveLength(1);
    expect(await unreadMessageCount(seller.id)).toBe(0);
    await sendMessage(conv.id, seller.id, "Yes it is!");
    expect((await listConversations(buyer.id))[0]._count.messages).toBe(1);
    await expect(sendMessage(conv.id, buyer.id, "   ")).rejects.toThrow(/empty/);
  });

  it("unverified users cannot message", async () => {
    const seller = await makeUser();
    const l = await publishedListing(seller.id);
    const u = await makeUser({ verified: false });
    await expect(startConversation(u.id, l.id, "hi")).rejects.toThrow(/verify/);
  });
});

describe("reports", () => {
  it("users can report listings once; admins resolve; optional auto-hide", async () => {
    const seller = await makeUser();
    const l = await publishedListing(seller.id);
    const r1 = await makeUser();
    const report = await createReport(r1.id, { listingId: l.id, reason: "SCAM", details: "Asks for advance payment" });
    expect(report.targetUserId).toBe(seller.id);
    await expect(createReport(r1.id, { listingId: l.id, reason: "SCAM" })).rejects.toThrow(/already reported/);
    await expect(createReport(seller.id, { listingId: l.id, reason: "SCAM" })).rejects.toThrow(/own listing/);
    const admin = await makeUser({ admin: true });
    await adminHandleReport(report.id, admin.id, "RESOLVED", "Warned seller");
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe("RESOLVED");

    const s = await getSettings();
    await updateSettingsGroup("moderation", { ...s.moderation, autoHideReportThreshold: 2 }, null);
    const l2 = await publishedListing(seller.id);
    await createReport((await makeUser()).id, { listingId: l2.id, reason: "SCAM" });
    await createReport((await makeUser()).id, { listingId: l2.id, reason: "SCAM" });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l2.id } })).status).toBe("REMOVED");
    await updateSettingsGroup("moderation", { ...s.moderation, autoHideReportThreshold: 0 }, null);
  });
});

describe("giveaways", () => {
  it("eligible users join; winners drawn randomly after end", async () => {
    const admin = await makeUser({ admin: true });
    const g = await prisma.giveaway.create({ data: { title: "Win an iPad", description: "d", prize: "iPad", startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 60000), status: "ACTIVE", winnersCount: 1 } });
    const users = await Promise.all([makeUser(), makeUser(), makeUser()]);
    for (const u of users) await joinGiveaway(g.id, u.id);
    await joinGiveaway(g.id, users[0].id); // idempotent
    await expect(drawWinners(g.id, admin.id)).rejects.toThrow(/not ended/);
    await prisma.giveaway.update({ where: { id: g.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const winners = await drawWinners(g.id, admin.id);
    expect(winners).toHaveLength(1);
    expect(await prisma.giveawayParticipant.count({ where: { giveawayId: g.id } })).toBe(3);

    const vipOnly = await prisma.giveaway.create({ data: { title: "VIP", description: "d", prize: "x", startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 60000), status: "ACTIVE", vipOnly: true } });
    await expect(joinGiveaway(vipOnly.id, users[1].id)).rejects.toThrow(/VIP/);
  });
});

describe("admin", () => {
  it("permission checks", () => {
    expect(hasPermission(["*"], "settings")).toBe(true);
    expect(hasPermission(["payments"], "settings")).toBe(false);
    expect(hasPermission(null, "payments")).toBe(false);
  });

  it("suspension revokes sessions; super admins are protected; role changes require verified email", async () => {
    const admin = await makeUser({ admin: true });
    const user = await makeUser();
    await prisma.session.create({ data: { id: `s-${user.id}`, userId: user.id, expiresAt: new Date(Date.now() + 1e9) } });
    await suspendUser(user.id, admin.id, "Spam", 7);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("SUSPENDED");
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const other = await makeUser({ admin: true });
    await expect(suspendUser(other.id, admin.id, "x", null)).rejects.toThrow(/Super admins/);
    const unverified = await makeUser({ verified: false });
    const role = await prisma.adminRole.findFirstOrThrow({ where: { name: "Moderator" } });
    await expect(setUserAdminRole(unverified.id, role.id, admin.id)).rejects.toThrow(/verified/);
  });

  it("revenue dashboard counts only verified payments", async () => {
    const rev = await revenueDashboard();
    const verified = await prisma.payment.aggregate({ where: { status: "VERIFIED" }, _sum: { amount: true } });
    expect(rev.total.posting + rev.total.fines + rev.total.subscriptions).toBe(verified._sum.amount ?? 0);
    const stats = await marketplaceStats();
    expect(stats.users).toBeGreaterThan(0);
  });
});

describe("utilities", () => {
  it("phone normalisation", () => {
    expect(normalizePhone("7771234")).toBe("+9607771234");
    expect(normalizePhone("+960 777-1234")).toBe("+9607771234");
    expect(normalizePhone("00960 3301234")).toBe("+9603301234");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+447911123456")).toBe("+447911123456");
  });
  it("money", () => {
    expect(formatMVR(2000)).toBe("MVR 20");
    expect(formatMVR(1050)).toBe("MVR 10.50");
    expect(mvrToLaari("1,250.5")).toBe(125050);
  });
  it("text cleaning strips control characters", () => {
    expect(cleanText("hi\u0000 there\u0007 ")).toBe("hi there");
  });
  it("addMonths clamps month ends", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(new Date("2026-03-15T00:00:00Z"), 2).toISOString().slice(0, 10)).toBe("2026-05-15");
  });
  it("rate limiter", async () => {
    const key = `t-${Date.now()}`;
    expect(await rateLimit(key, 2, 60)).toBe(true);
    expect(await rateLimit(key, 2, 60)).toBe(true);
    expect(await rateLimit(key, 2, 60)).toBe(false);
  });
});
