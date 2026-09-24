import { OtpChannel, OtpPurpose } from "@prisma/client";
import { prisma } from "./db";
import { hmac, randomDigits, safeEqual } from "./crypto";
import { UserError } from "./errors";
import { rateLimit } from "./rate-limit";
import { sendEmail, sendSms } from "./messaging-providers";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export function otpHash(otpId: string, code: string) {
  return hmac(`otp:${otpId}:${code}`);
}

const purposeText: Record<OtpPurpose, string> = {
  VERIFY_EMAIL: "verify your email",
  VERIFY_PHONE: "verify your phone number",
  ADMIN_LOGIN: "complete your admin sign-in",
  PASSWORD_RESET: "reset your password",
};

export async function issueOtp(params: { userId?: string | null; target: string; channel: OtpChannel; purpose: OtpPurpose }) {
  const target = params.target.trim().toLowerCase();
  const recent = await prisma.otpCode.findFirst({
    where: { target, purpose: params.purpose, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000) } },
  });
  if (recent) throw new UserError("A code was sent recently. Please wait a minute before requesting another.", "RATE_LIMITED");
  if (!(await rateLimit(`otp:${params.purpose}:${target}`, 6, 3600))) {
    throw new UserError("Too many codes requested. Please try again later.", "RATE_LIMITED");
  }

  // Invalidate any older outstanding codes for this purpose.
  await prisma.otpCode.updateMany({
    where: { target, purpose: params.purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = randomDigits(6);
  const row = await prisma.otpCode.create({
    data: {
      userId: params.userId ?? null,
      target,
      channel: params.channel,
      purpose: params.purpose,
      codeHash: "pending",
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
  });
  await prisma.otpCode.update({ where: { id: row.id }, data: { codeHash: otpHash(row.id, code) } });

  const text = `Your MV Markets code is ${code}. Use it to ${purposeText[params.purpose]}. It expires in ${OTP_TTL_MINUTES} minutes. Never share this code with anyone.`;
  if (params.channel === "EMAIL") await sendEmail(target, `Your MV Markets code: ${code}`, text);
  else await sendSms(target, text);
  return { id: row.id };
}

export async function verifyOtp(params: { target: string; purpose: OtpPurpose; code: string }): Promise<{ userId: string | null }> {
  const target = params.target.trim().toLowerCase();
  const code = params.code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) throw new UserError("Enter the 6-digit code.");
  const row = await prisma.otpCode.findFirst({
    where: { target, purpose: params.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.expiresAt < new Date()) throw new UserError("This code has expired. Please request a new one.");
  if (row.attempts >= OTP_MAX_ATTEMPTS) throw new UserError("Too many incorrect attempts. Please request a new code.");

  if (!safeEqual(row.codeHash, otpHash(row.id, code))) {
    const updated = await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    if (updated.attempts >= OTP_MAX_ATTEMPTS) await prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    throw new UserError("Incorrect code. Please check and try again.");
  }
  // Atomic consume prevents double-use under concurrency.
  const consumed = await prisma.otpCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) throw new UserError("This code has already been used.");
  return { userId: row.userId };
}
