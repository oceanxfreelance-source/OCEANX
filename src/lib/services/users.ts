import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { referralCode as newReferralCode } from "../crypto";
import { UserError } from "../errors";
import { dummyVerify, hashPassword, passwordProblem, verifyPassword } from "../auth/password";
import { issueOtp, verifyOtp } from "../otp";
import { enforceRateLimit } from "../rate-limit";
import { emailSchema, optionalPhone, textField } from "../validation";
import { audit } from "../audit";
import { evaluateReferral } from "./referrals";

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

export const registerSchema = z.object({
  name: textField(2, 60, "Name"),
  email: emailSchema,
  phone: optionalPhone,
  password: z.string(),
  referralCode: z.string().trim().toUpperCase().max(20).optional().default(""),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the Terms and Privacy Policy." }) }),
});

async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = newReferralCode();
    if (!(await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } }))) return code;
  }
  throw new Error("Could not allocate referral code");
}

export async function registerUser(input: z.input<typeof registerSchema>, ctx: { ipHash: string | null }) {
  const data = registerSchema.parse(input);
  const pwProblem = passwordProblem(data.password);
  if (pwProblem) throw new UserError(pwProblem);
  await enforceRateLimit(`register:${ctx.ipHash ?? "unknown"}`, 10, 3600, "Too many sign-ups from this network. Please try later.");

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: data.email }, ...(data.phone ? [{ phone: data.phone }] : [])] },
    select: { email: true },
  });
  if (existing) {
    throw new UserError(existing.email === data.email ? "An account with this email already exists." : "This phone number is already registered.");
  }

  const referrer = data.referralCode
    ? await prisma.user.findUnique({ where: { referralCode: data.referralCode }, select: { id: true, signupIpHash: true } })
    : null;

  const passwordHash = await hashPassword(data.password);
  const docs = await prisma.termsDocument.findMany({ where: { isCurrent: true }, select: { id: true } });

  let user: User;
  try {
    user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: data.email,
          phone: data.phone,
          name: data.name,
          passwordHash,
          referralCode: await uniqueReferralCode(),
          referredById: referrer?.id ?? null,
          signupIpHash: ctx.ipHash,
          profile: { create: { displayName: data.name } },
          sellerStats: { create: {} },
          vipStatus: { create: {} },
        },
      });
      if (docs.length) {
        await tx.termsAcceptance.createMany({ data: docs.map((d) => ({ userId: u.id, documentId: d.id, ipHash: ctx.ipHash })) });
      }
      if (referrer) {
        const sameNetwork = !!ctx.ipHash && referrer.signupIpHash === ctx.ipHash;
        await tx.referral.create({
          data: {
            referrerId: referrer.id,
            referredId: u.id,
            status: "PENDING",
            // Shared networks are common (mobile carrier NAT), so this only routes the referral to admin review.
            reason: sameNetwork ? "Same network as referrer — needs admin review" : null,
          },
        });
      }
      return u;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new UserError("An account with these details already exists.");
    throw e;
  }

  await issueOtp({ userId: user.id, target: user.email, channel: "EMAIL", purpose: "VERIFY_EMAIL" });
  await audit({ actorId: user.id, action: "user.register", entityType: "User", entityId: user.id, summary: `New account ${user.email}`, ipHash: ctx.ipHash });
  return user;
}

export async function resendVerification(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) throw new UserError("Your email is already verified.");
  await issueOtp({ userId: user.id, target: user.email, channel: "EMAIL", purpose: "VERIFY_EMAIL" });
}

export async function verifyEmail(userId: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return user;
  const res = await verifyOtp({ target: user.email, purpose: "VERIFY_EMAIL", code });
  if (res.userId && res.userId !== user.id) throw new UserError("Invalid code.");
  const updated = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  await evaluateReferral(user.id);
  return updated;
}

export async function requestPhoneVerification(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.phone) throw new UserError("Add a phone number first.");
  if (user.phoneVerifiedAt) throw new UserError("Your phone is already verified.");
  await issueOtp({ userId, target: user.phone, channel: "SMS", purpose: "VERIFY_PHONE" });
}

export async function verifyPhone(userId: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.phone) throw new UserError("Add a phone number first.");
  await verifyOtp({ target: user.phone, purpose: "VERIFY_PHONE", code });
  return prisma.user.update({ where: { id: userId }, data: { phoneVerifiedAt: new Date() } });
}

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";

export async function authenticate(emailRaw: string, password: string, ctx: { ipHash: string | null }) {
  const email = emailSchema.safeParse(emailRaw);
  if (!email.success || !password) throw new UserError(GENERIC_LOGIN_ERROR);
  await enforceRateLimit(`login:ip:${ctx.ipHash ?? "unknown"}`, 30, 900);
  await enforceRateLimit(`login:email:${email.data}`, 10, 900);

  const user = await prisma.user.findUnique({ where: { email: email.data }, include: { adminRole: true } });
  if (!user) {
    await dummyVerify(password);
    throw new UserError(GENERIC_LOGIN_ERROR);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new UserError("This account is temporarily locked after several failed attempts. Try again in a few minutes.");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const fails = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: fails >= LOCKOUT_THRESHOLD ? 0 : fails,
        lockedUntil: fails >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    throw new UserError(GENERIC_LOGIN_ERROR);
  }
  if (user.status === "BANNED") throw new UserError("This account has been closed. Contact support if you believe this is a mistake.");
  if (user.status === "SUSPENDED") {
    if (user.suspendedUntil && user.suspendedUntil < new Date()) {
      await prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE", suspendedReason: null, suspendedUntil: null } });
    } else {
      throw new UserError(`This account is suspended${user.suspendedReason ? `: ${user.suspendedReason}` : "."} Contact support for help.`);
    }
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  return user;
}

export async function startAdminMfa(user: { id: string; email: string }) {
  await issueOtp({ userId: user.id, target: user.email, channel: "EMAIL", purpose: "ADMIN_LOGIN" });
}

export async function completeAdminMfa(user: { id: string; email: string }, code: string) {
  const res = await verifyOtp({ target: user.email, purpose: "ADMIN_LOGIN", code });
  if (res.userId !== user.id) throw new UserError("Invalid code.");
}

export async function requestPasswordReset(emailRaw: string, ctx: { ipHash: string | null }) {
  await enforceRateLimit(`pwreset:${ctx.ipHash ?? "unknown"}`, 10, 3600);
  const email = emailSchema.safeParse(emailRaw);
  if (!email.success) return;
  const user = await prisma.user.findUnique({ where: { email: email.data } });
  if (!user) return; // do not reveal whether the account exists
  try {
    await issueOtp({ userId: user.id, target: user.email, channel: "EMAIL", purpose: "PASSWORD_RESET" });
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
  }
}

export async function resetPassword(emailRaw: string, code: string, newPassword: string) {
  const email = emailSchema.parse(emailRaw);
  const problem = passwordProblem(newPassword);
  if (problem) throw new UserError(problem);
  const res = await verifyOtp({ target: email, purpose: "PASSWORD_RESET", code });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || (res.userId && res.userId !== user.id)) throw new UserError("Invalid code.");
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
  await audit({ actorId: user.id, action: "user.password_reset", entityType: "User", entityId: user.id, summary: "Password reset via email code" });
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, user.passwordHash))) throw new UserError("Current password is incorrect.");
  const problem = passwordProblem(next);
  if (problem) throw new UserError(problem);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
}

export const profileSchema = z.object({
  name: textField(2, 60, "Name"),
  phone: optionalPhone,
  whatsapp: optionalPhone,
  bio: z.string().max(500).optional().default(""),
  showPhone: z.boolean(),
  notifyByEmail: z.boolean(),
  atollId: z.string().optional().nullable(),
  islandId: z.string().optional().nullable(),
});

export async function updateProfile(userId: string, input: z.input<typeof profileSchema>) {
  const data = profileSchema.parse(input);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (data.phone && data.phone !== user.phone) {
    const taken = await prisma.user.findFirst({ where: { phone: data.phone, NOT: { id: userId } } });
    if (taken) throw new UserError("This phone number is already registered.");
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      phone: data.phone,
      phoneVerifiedAt: data.phone === user.phone ? user.phoneVerifiedAt : null,
      profile: {
        upsert: {
          create: { displayName: data.name, bio: data.bio, whatsapp: data.whatsapp, showPhone: data.showPhone, notifyByEmail: data.notifyByEmail, atollId: data.atollId || null, islandId: data.islandId || null },
          update: { displayName: data.name, bio: data.bio, whatsapp: data.whatsapp, showPhone: data.showPhone, notifyByEmail: data.notifyByEmail, atollId: data.atollId || null, islandId: data.islandId || null },
        },
      },
    },
  });
}

export async function acceptCurrentTerms(userId: string, ipHash: string | null) {
  const docs = await prisma.termsDocument.findMany({ where: { isCurrent: true } });
  for (const d of docs) {
    await prisma.termsAcceptance.upsert({
      where: { userId_documentId: { userId, documentId: d.id } },
      create: { userId, documentId: d.id, ipHash },
      update: {},
    });
  }
}

export async function pendingTermsFor(userId: string) {
  const docs = await prisma.termsDocument.findMany({ where: { isCurrent: true }, include: { acceptances: { where: { userId }, select: { id: true } } } });
  return docs.filter((d) => d.acceptances.length === 0);
}
