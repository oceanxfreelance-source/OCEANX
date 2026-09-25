import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { faqAnswer, botReply } from "@/lib/services/support-bot";
import { requestAgent, sendAsUser, sendAsAgent, closeThread, currentThread, unansweredCount } from "@/lib/services/support";
import { makeUser, resetSettings } from "./helpers";

beforeAll(resetSettings);

describe("help assistant", () => {
  it("answers common questions from the built-in guide when AI is not configured", async () => {
    expect(faqAnswer("how do i sell my bike?")).toMatch(/Post a listing|\+ button/);
    expect(faqAnswer("where do I upload the payment slip")).toMatch(/slip/);
    expect(faqAnswer("how to mark as sold")).toMatch(/proof/);
    expect(faqAnswer("android app download")).toMatch(/Download for Android/);
    expect(faqAnswer("qwerty zxcv")).toMatch(/Talk to a person/);
    const r = await botReply([{ role: "user", content: "How does the giveaway draw work?" }]);
    expect(r.source).toBe("faq");
    expect(r.text).toMatch(/Giveaways|draw/);
  });
});

describe("talk to a person (live chat)", () => {
  it("opens a chat with the assistant context, alerts support admins, and both sides can talk", async () => {
    const admin = await makeUser({ admin: true });
    const customer = await makeUser({ name: "Mariyam" });
    const before = await unansweredCount();

    const id = await requestAgent(customer.id, [
      { role: "user", content: "My payment is stuck" },
      { role: "assistant", content: "Let me connect you" },
    ]);
    const t = await currentThread(customer.id);
    expect(t!.id).toBe(id);
    expect(t!.status).toBe("WAITING");
    expect(t!.messages.map((m) => m.sender)).toEqual(["USER", "BOT", "SYSTEM"]);
    expect(await prisma.notification.count({ where: { userId: admin.id, type: "support", link: `/admin/support/${id}` } })).toBe(1);
    expect(await unansweredCount()).toBe(before + 1);
    // Asking again reuses the same open chat.
    expect(await requestAgent(customer.id, [])).toBe(id);

    await sendAsUser(customer.id, id, "Reference 12345");
    // Throttled: no second admin alert within 2 minutes.
    expect(await prisma.notification.count({ where: { userId: admin.id, type: "support" } })).toBe(1);

    await sendAsAgent(admin.id, id, "Hi Mariyam, we're checking it now.");
    const after = await prisma.supportThread.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe("OPEN");
    expect(await prisma.notification.count({ where: { userId: customer.id, type: "support", title: "MV Markets team replied" } })).toBe(1);

    const other = await makeUser();
    await expect(sendAsUser(other.id, id, "hi")).rejects.toThrow();
    await expect(sendAsUser(customer.id, id, "   ")).rejects.toThrow(/Type a message/);

    await closeThread(id, { adminId: admin.id });
    expect(await currentThread(customer.id)).toBeNull();
    await expect(sendAsUser(customer.id, id, "hello?")).rejects.toThrow(/closed/);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: { in: ["support.answer", "support.close"] } } })).toBe(2);
  });
});
