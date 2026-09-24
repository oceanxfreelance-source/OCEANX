"use server";

import { redirect } from "next/navigation";
import { runAction, str, bool, safeNext, type ActionState } from "@/lib/action";
import { createSession, destroySession, clientIpHash, getSession, markSessionMfaVerified } from "@/lib/auth/session";
import {
  registerUser,
  authenticate,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  startAdminMfa,
  completeAdminMfa,
  acceptCurrentTerms,
  changePassword,
  updateProfile,
  requestPhoneVerification,
  verifyPhone,
} from "@/lib/services/users";
import { UserError } from "@/lib/errors";
import { audit } from "@/lib/audit";

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let userId = "";
  const res = await runAction(async () => {
    if (str(fd, "password") !== str(fd, "confirm")) throw new UserError("Passwords do not match.");
    const user = await registerUser(
      { name: str(fd, "name"), email: str(fd, "email"), phone: str(fd, "phone"), password: str(fd, "password"), referralCode: str(fd, "ref"), acceptTerms: bool(fd, "acceptTerms") as true },
      { ipHash: await clientIpHash() },
    );
    userId = user.id;
  });
  if (res?.error) return res;
  await createSession(userId);
  redirect(`/verify?next=${encodeURIComponent(safeNext(str(fd, "next"), "/account"))}`);
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let dest = "/";
  const res = await runAction(async () => {
    const user = await authenticate(str(fd, "email"), str(fd, "password"), { ipHash: await clientIpHash() });
    await createSession(user.id);
    if (user.adminRole) {
      await startAdminMfa(user).catch((e) => {
        if (!(e instanceof UserError)) throw e;
      });
      dest = "/admin-verify";
    } else {
      dest = user.emailVerifiedAt ? safeNext(str(fd, "next"), "/") : `/verify?next=${encodeURIComponent(safeNext(str(fd, "next"), "/"))}`;
    }
  });
  if (res?.error) return res;
  redirect(dest);
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function verifyEmailAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");
  const res = await runAction(async () => {
    await verifyEmail(session.userId, str(fd, "code"));
  });
  if (res?.error) return res;
  redirect(safeNext(str(fd, "next"), "/account"));
}

export async function resendVerificationAction(): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");
  return runAction(async () => {
    await resendVerification(session.userId);
    return { message: "A new code has been sent to your email." };
  });
}

export async function adminVerifyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session?.user.adminRole) redirect("/");
  const res = await runAction(async () => {
    await completeAdminMfa(session.user, str(fd, "code"));
    await markSessionMfaVerified();
    await audit({ actorId: session.userId, action: "admin.login", entityType: "User", entityId: session.userId, summary: "Admin signed in with email code", ipHash: await clientIpHash() });
  });
  if (res?.error) return res;
  redirect("/admin");
}

export async function resendAdminCodeAction(): Promise<ActionState> {
  const session = await getSession();
  if (!session?.user.adminRole) redirect("/");
  return runAction(async () => {
    await startAdminMfa(session.user);
    return { message: "A new code has been sent." };
  });
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    await requestPasswordReset(str(fd, "email"), { ipHash: await clientIpHash() });
  });
  if (res?.error) return res;
  redirect(`/reset-password?email=${encodeURIComponent(str(fd, "email").trim().toLowerCase())}`);
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    if (str(fd, "password") !== str(fd, "confirm")) throw new UserError("Passwords do not match.");
    await resetPassword(str(fd, "email"), str(fd, "code"), str(fd, "password"));
  });
  if (res?.error) return res;
  redirect("/login?reset=1");
}

export async function acceptTermsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!bool(fd, "accept")) return { error: "Please tick the box to accept." };
  await acceptCurrentTerms(session.userId, await clientIpHash());
  redirect(safeNext(str(fd, "next"), "/account"));
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");
  return runAction(async () => {
    if (str(fd, "password") !== str(fd, "confirm")) throw new UserError("Passwords do not match.");
    await changePassword(session.userId, str(fd, "current"), str(fd, "password"));
    return { message: "Password updated." };
  });
}

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");
  return runAction(async () => {
    await updateProfile(session.userId, {
      name: str(fd, "name"),
      phone: str(fd, "phone"),
      whatsapp: str(fd, "whatsapp"),
      bio: str(fd, "bio"),
      showPhone: bool(fd, "showPhone"),
      notifyByEmail: bool(fd, "notifyByEmail"),
      atollId: str(fd, "atollId") || null,
      islandId: str(fd, "islandId") || null,
    });
    return { message: "Profile saved." };
  });
}

export async function requestPhoneCodeAction(): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");
  return runAction(async () => {
    await requestPhoneVerification(session.userId);
    return { message: "We sent a code to your phone." };
  });
}

export async function verifyPhoneAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");
  return runAction(async () => {
    await verifyPhone(session.userId, str(fd, "code"));
    return { message: "Phone number verified." };
  });
}
