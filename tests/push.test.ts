import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { saveSubscription, sendAnnouncement, broadcastFeed, setPushSenderForTests, getVapidKeys } from "@/lib/services/push";
import { getSettings, updateSettingsGroup } from "@/lib/settings";
import { makeUser, publishedListing, resetSettings } from "./helpers";

type Sent = { endpoint: string; payload: { title: string; body: string; url: string; tag: string } };
let sent: Sent[] = [];
let failWith: Record<string, number> = {};

function sub(tag: string) {
  return { endpoint: `https://push.example.com/${tag}-${Math.random().toString(36).slice(2)}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
}

beforeEach(async () => {
  await resetSettings();
  await prisma.pushSubscription.deleteMany({});
  sent = [];
  failWith = {};
  setPushSenderForTests(async (s, payload) => {
    const code = Object.entries(failWith).find(([k]) => s.endpoint.includes(k))?.[1];
    if (code) throw Object.assign(new Error("push failed"), { statusCode: code });
    sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
  });
});
afterEach(() => setPushSenderForTests(null));

describe("push notifications", () => {
  it("creates VAPID keys once and reuses them", async () => {
    const a = await getVapidKeys();
    const b = await getVapidKeys();
    expect(a.publicKey).toBe(b.publicKey);
    expect(a.publicKey.length).toBeGreaterThan(40);
  });

  it("rejects malformed subscriptions", async () => {
    await expect(saveSubscription({ endpoint: "http://insecure" }, null, null)).rejects.toThrow();
    await expect(saveSubscription(null, null, null)).rejects.toThrow();
  });

  it("announces a newly published listing to everyone except the seller, once", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const s1 = sub("seller");
    const s2 = sub("buyer");
    const s3 = sub("visitor");
    await saveSubscription(s1, seller.id, "test");
    await saveSubscription(s2, buyer.id, "test");
    await saveSubscription(s3, null, "test");

    const l = await publishedListing(seller.id, { title: "Yamaha Ray ZR 2021" });
    const got = sent.map((x) => x.endpoint).sort();
    expect(got).toEqual([s2.endpoint, s3.endpoint].sort());
    expect(sent[0].payload.title).toContain("Yamaha Ray ZR 2021");
    expect(sent[0].payload.url).toBe(`/listing/${l.id}`);
    expect(sent[0].payload.tag).toBe("new-listing");
    const b = await prisma.broadcast.findFirstOrThrow({ where: { listingId: l.id } });
    expect(b.sentCount).toBe(2);

    // The Android feed shows it to others but not to the seller.
    const since = new Date(Date.now() - 60_000);
    const forBuyer = await broadcastFeed(since, buyer.id);
    expect(forBuyer.items.some((i) => i.id === b.id)).toBe(true);
    expect(forBuyer.newItems).toBeGreaterThanOrEqual(1);
    expect((await broadcastFeed(since, seller.id)).items.some((i) => i.id === b.id)).toBe(false);
    expect((await broadcastFeed(new Date(), buyer.id)).items.length).toBe(0);
  });

  it("removes phones that unsubscribed (410) and can be switched off by the admin", async () => {
    const seller = await makeUser();
    const gone = sub("gone");
    await saveSubscription(gone, null, "test");
    failWith = { gone: 410 };
    await publishedListing(seller.id);
    expect(await prisma.pushSubscription.count({ where: { endpoint: gone.endpoint } })).toBe(0);

    const s = await getSettings();
    await updateSettingsGroup("notifications", { ...s.notifications, pushNewListings: false }, null);
    await saveSubscription(sub("x"), null, "test");
    sent = [];
    const l = await publishedListing(seller.id);
    expect(sent).toHaveLength(0);
    expect(await prisma.broadcast.count({ where: { listingId: l.id } })).toBe(0);
  });

  it("sends admin announcements (e.g. App updated) to everyone and audits them", async () => {
    const admin = await makeUser({ admin: true });
    await saveSubscription(sub("a"), null, "test");
    await saveSubscription(sub("b"), admin.id, "test");
    await expect(sendAnnouncement(admin.id, { title: "", body: "x" })).rejects.toThrow();
    await expect(sendAnnouncement(admin.id, { title: "Hi", body: "x", url: "https://evil.example" })).rejects.toThrow(/page on this site/);
    const r = await sendAnnouncement(admin.id, { title: "MV Markets updated", body: "Open the app to see what's new.", url: "/" });
    expect(r.sent).toBe(2);
    expect(sent.every((x) => x.payload.title === "MV Markets updated")).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "push.announce", entityId: r.id } })).toBe(1);
  });
});
