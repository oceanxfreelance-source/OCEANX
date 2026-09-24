import { prisma } from "../db";
import { UserError, NotFoundError } from "../errors";
import { audit } from "../audit";
import { notify } from "../notify";
import { ALL_PERMISSIONS } from "../permissions";

export async function suspendUser(userId: string, adminId: string, reason: string, days: number | null) {
  if (!reason.trim()) throw new UserError("A reason is required.");
  if (userId === adminId) throw new UserError("You cannot suspend yourself.");
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { adminRole: true } });
  if (!u) throw new NotFoundError();
  if (u.adminRole?.permissions.includes("*")) throw new UserError("Super admins cannot be suspended.");
  const until = days ? new Date(Date.now() + days * 86400000) : null;
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status: "SUSPENDED", suspendedReason: reason, suspendedUntil: until } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  await audit({ actorId: adminId, action: "user.suspend", entityType: "User", entityId: userId, summary: `Suspended ${u.email}${until ? ` until ${until.toISOString().slice(0, 10)}` : ""}: ${reason}` });
}

export async function banUser(userId: string, adminId: string, reason: string) {
  if (!reason.trim()) throw new UserError("A reason is required.");
  if (userId === adminId) throw new UserError("You cannot ban yourself.");
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { adminRole: true } });
  if (!u) throw new NotFoundError();
  if (u.adminRole?.permissions.includes("*")) throw new UserError("Super admins cannot be banned.");
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status: "BANNED", suspendedReason: reason } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.listing.updateMany({ where: { sellerId: userId, status: "PUBLISHED" }, data: { status: "REMOVED", removedAt: new Date(), removedReason: "Account closed" } }),
  ]);
  await audit({ actorId: adminId, action: "user.ban", entityType: "User", entityId: userId, summary: `Banned ${u.email}: ${reason}` });
}

export async function reinstateUser(userId: string, adminId: string, reason: string) {
  const u = await prisma.user.update({ where: { id: userId }, data: { status: "ACTIVE", suspendedReason: null, suspendedUntil: null } });
  await audit({ actorId: adminId, action: "user.reinstate", entityType: "User", entityId: userId, summary: `Reinstated ${u.email}: ${reason}` });
  await notify(userId, { type: "account", title: "Account reinstated", body: "Your MV Markets account is active again." });
}

export async function clearSellerReview(userId: string, adminId: string, reason: string) {
  await prisma.sellerStatistics.update({ where: { userId }, data: { underReview: false } });
  await audit({ actorId: adminId, action: "seller.review_cleared", entityType: "User", entityId: userId, summary: reason || "Review cleared" });
}

export async function setUserAdminRole(userId: string, roleId: string | null, adminId: string) {
  if (userId === adminId) throw new UserError("You cannot change your own admin role.");
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError();
  if (roleId && !u.emailVerifiedAt) throw new UserError("Only users with a verified email can become admins.");
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { adminRoleId: roleId } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  const role = roleId ? await prisma.adminRole.findUnique({ where: { id: roleId } }) : null;
  await audit({ actorId: adminId, action: "admin.role_changed", entityType: "User", entityId: userId, summary: `${u.email} → ${role?.name ?? "no admin access"}` });
}

export async function saveAdminRole(adminId: string, input: { id?: string; name: string; description?: string; permissions: string[] }) {
  const perms = input.permissions.filter((p) => (ALL_PERMISSIONS as string[]).includes(p));
  if (!input.name.trim()) throw new UserError("Role name is required.");
  if (input.id) {
    const existing = await prisma.adminRole.findUnique({ where: { id: input.id } });
    if (!existing) throw new NotFoundError();
    if (existing.isSystem) throw new UserError("System roles cannot be edited.");
    await prisma.adminRole.update({ where: { id: input.id }, data: { name: input.name.trim(), description: input.description || null, permissions: perms } });
  } else {
    await prisma.adminRole.create({ data: { name: input.name.trim(), description: input.description || null, permissions: perms } });
  }
  await audit({ actorId: adminId, action: "admin.role_saved", entityType: "AdminRole", entityId: input.id ?? null, summary: `${input.name}: ${perms.join(", ")}` });
}
