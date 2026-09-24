import "server-only";
import { redirect, notFound } from "next/navigation";
import { getSession } from "./session";
import { hasPermission, type Permission } from "../permissions";
import { ForbiddenError } from "../errors";

export async function requireUser(next?: string) {
  const session = await getSession();
  if (!session) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return session.user;
}

export async function requireVerifiedUser(next?: string) {
  const user = await requireUser(next);
  if (!user.emailVerifiedAt) redirect(`/verify${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

/** True only for a signed-in admin whose session completed the email OTP step. */
export async function getAdmin() {
  const session = await getSession();
  if (!session?.user.adminRole || !session.mfaVerified) return null;
  return { user: session.user, permissions: session.user.adminRole.permissions };
}

/**
 * Server-side admin gate for pages. Non-admins get a 404 so the admin area is not discoverable.
 * Admins without the specific permission also get a 404.
 */
export async function requireAdminPage(permission?: Permission) {
  const session = await getSession();
  if (!session?.user.adminRole) notFound();
  if (!session.mfaVerified) redirect("/admin-verify");
  if (permission && !hasPermission(session.user.adminRole.permissions, permission)) notFound();
  return { user: session.user, permissions: session.user.adminRole.permissions };
}

/** Server-side admin gate for actions / API routes. Throws instead of redirecting. */
export async function requireAdmin(permission: Permission) {
  const admin = await getAdmin();
  if (!admin || !hasPermission(admin.permissions, permission)) throw new ForbiddenError();
  return admin;
}
