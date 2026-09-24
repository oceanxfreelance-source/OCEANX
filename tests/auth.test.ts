import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { registerUser, verifyEmail, authenticate, requestPasswordReset, resetPassword, pendingTermsFor } from "@/lib/services/users";
import { verifyOtp } from "@/lib/otp";
import { lastOtp, resetSettings } from "./helpers";
import { UserError } from "@/lib/errors";

beforeAll(resetSettings);

describe("registration, OTP and login", () => {
  it("registers, sends an email OTP and verifies the email", async () => {
    const user = await registerUser(
      { name: "Aishath Test", email: "Aishath@Example.MV", phone: "777 1111", password: "secret123", acceptTerms: true },
      { ipHash: "ip-a" },
    );
    expect(user.email).toBe("aishath@example.mv");
    expect(user.phone).toBe("+9607771111");
    expect(user.emailVerifiedAt).toBeNull();
    expect(await pendingTermsFor(user.id)).toHaveLength(0); // acceptance recorded at sign-up

    const code = lastOtp(user.email)!;
    expect(code).toMatch(/^\d{6}$/);
    const verified = await verifyEmail(user.id, code);
    expect(verified.emailVerifiedAt).not.toBeNull();
  });

  it("rejects duplicate email / phone and weak passwords", async () => {
    await expect(registerUser({ name: "X Y", email: "aishath@example.mv", password: "secret123", acceptTerms: true }, { ipHash: "ip-b" })).rejects.toThrow(/already exists/);
    await expect(registerUser({ name: "X Y", email: "new@example.mv", phone: "7771111", password: "secret123", acceptTerms: true }, { ipHash: "ip-b" })).rejects.toThrow(/phone/);
    await expect(registerUser({ name: "X Y", email: "new2@example.mv", password: "short", acceptTerms: true }, { ipHash: "ip-b" })).rejects.toThrow(UserError);
    await expect(registerUser({ name: "X Y", email: "new3@example.mv", password: "secret123", acceptTerms: false as unknown as true }, { ipHash: "ip-b" })).rejects.toThrow();
  });

  it("OTP: wrong codes are counted and the code is burnt after 5 attempts; codes are single-use", async () => {
    const user = await registerUser({ name: "Otp Tester", email: "otp@example.mv", password: "secret123", acceptTerms: true }, { ipHash: "ip-c" });
    const code = lastOtp(user.email)!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await expect(verifyEmail(user.id, wrong)).rejects.toThrow(UserError);
    await expect(verifyEmail(user.id, code)).rejects.toThrow(/expired|request a new/i);
  });

  it("OTP resend is rate limited (cooldown)", async () => {
    const { resendVerification } = await import("@/lib/services/users");
    const u = await registerUser({ name: "Cool Down", email: "cool@example.mv", password: "secret123", acceptTerms: true }, { ipHash: "ip-d" });
    await expect(resendVerification(u.id)).rejects.toThrow(/wait/);
  });

  it("login succeeds with the right password and locks after repeated failures", async () => {
    const u = await authenticate("aishath@example.mv", "secret123", { ipHash: "ip-a" });
    expect(u.email).toBe("aishath@example.mv");
    for (let i = 0; i < 5; i++) await expect(authenticate("aishath@example.mv", "wrongpass1", { ipHash: "ip-a" })).rejects.toThrow(/Incorrect/);
    await expect(authenticate("aishath@example.mv", "secret123", { ipHash: "ip-a" })).rejects.toThrow(/locked/);
    await prisma.user.update({ where: { email: "aishath@example.mv" }, data: { lockedUntil: null } });
  });

  it("unknown emails give the same generic error", async () => {
    await expect(authenticate("nobody@example.mv", "secret123", { ipHash: "ip-z" })).rejects.toThrow("Incorrect email or password.");
  });

  it("suspended users cannot log in", async () => {
    await prisma.user.update({ where: { email: "otp@example.mv" }, data: { status: "SUSPENDED", suspendedReason: "Spam" } });
    await expect(authenticate("otp@example.mv", "secret123", { ipHash: "ip-c" })).rejects.toThrow(/suspended/);
  });

  it("password reset via email code revokes sessions", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "aishath@example.mv" } });
    await prisma.session.create({ data: { id: "sess-1", userId: user.id, expiresAt: new Date(Date.now() + 1e9) } });
    await requestPasswordReset("aishath@example.mv", { ipHash: "ip-a" });
    const code = lastOtp("aishath@example.mv")!;
    await resetPassword("aishath@example.mv", code, "newsecret456");
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    await expect(authenticate("aishath@example.mv", "newsecret456", { ipHash: "ip-a" })).resolves.toBeTruthy();
  });

  it("password reset does not reveal unknown emails", async () => {
    await expect(requestPasswordReset("ghost@example.mv", { ipHash: "ip-q" })).resolves.toBeUndefined();
  });

  it("verifyOtp rejects malformed codes", async () => {
    await expect(verifyOtp({ target: "x@y.mv", purpose: "VERIFY_EMAIL", code: "12ab" })).rejects.toThrow(/6-digit/);
  });

  it("referrals: pending until the referred user is genuinely active; same-network referrals need admin review", async () => {
    const referrer = await prisma.user.findUniqueOrThrow({ where: { email: "aishath@example.mv" } });
    await prisma.user.update({ where: { id: referrer.id }, data: { signupIpHash: "ip-ref" } });
    const referred = await registerUser({ name: "Referred One", email: "ref1@example.mv", password: "secret123", referralCode: referrer.referralCode, acceptTerms: true }, { ipHash: "ip-other" });
    let r = await prisma.referral.findUniqueOrThrow({ where: { referredId: referred.id } });
    expect(r.status).toBe("PENDING");
    await verifyEmail(referred.id, lastOtp(referred.email)!);
    r = await prisma.referral.findUniqueOrThrow({ where: { referredId: referred.id } });
    expect(r.status).toBe("PENDING"); // needs a published listing by default

    const sameNet = await registerUser({ name: "Same Net", email: "ref2@example.mv", password: "secret123", referralCode: referrer.referralCode, acceptTerms: true }, { ipHash: "ip-ref" });
    const r2 = await prisma.referral.findUniqueOrThrow({ where: { referredId: sameNet.id } });
    expect(r2.reason).toMatch(/admin review/);
  });
});
