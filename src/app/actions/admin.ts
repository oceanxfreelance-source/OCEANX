"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReportStatus, TermsType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { runAction, str, bool, int, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { mvrToLaari } from "@/lib/money";
import { parseMvDateTime } from "@/lib/dates";
import { slugify, cleanText } from "@/lib/validation";
import { getSettings, updateSettingsGroup, settingsSchema, type SettingsGroup } from "@/lib/settings";
import { SETTINGS_FORMS, setPath } from "@/lib/settings-fields";
import { processImage } from "@/lib/images";
import { saveFile } from "@/lib/storage";
import { adminVerifyPayment, adminRejectPayment, adminRefundPayment, adminRescreenPayment } from "@/lib/services/payments";
import { adminRemoveListing, adminRestoreListing } from "@/lib/services/listings";
import { suspendUser, banUser, reinstateUser, clearSellerReview, setUserAdminRole, saveAdminRole } from "@/lib/services/admin-users";
import { adminHandleReport } from "@/lib/services/reports";
import { adjustStars, recomputeSellerStats } from "@/lib/services/reputation";
import { adminApproveVip, adminRejectVip, adminSuspendVip, adminRestoreVip, adminRevokeVip, evaluateVip, runVipMaintenance } from "@/lib/services/vip";
import { adminReviewDeal, reviewSaleProof } from "@/lib/services/deals";
import { adminResolveCancellation } from "@/lib/services/cancellations";
import { createOrUpdatePool, calculatePool, adjustAllocation, approvePool, recordRewardPayment, setAllocationWithheld } from "@/lib/services/rewards";
import { adminSetBusinessVerified, adminSetBusinessStatus } from "@/lib/services/business";
import { drawWinners, deleteGiveaway } from "@/lib/services/giveaways";
import { normalizeAdLink } from "@/lib/ad-link";
import { adminSetReferralStatus } from "@/lib/services/referrals";

async function uploadAdminImage(fd: FormData, key: string, purpose: string, ownerId: string, maxSize = 1600): Promise<string | undefined> {
  const f = fd.get(key);
  if (!(f instanceof File) || f.size === 0) return undefined;
  const img = await processImage(Buffer.from(await f.arrayBuffer()), { maxSize });
  const saved = await saveFile({ buffer: img.buffer, mimeType: img.mimeType, visibility: "PUBLIC", purpose, ownerId, width: img.width, height: img.height });
  return saved.id;
}

// ───────────── Payments ─────────────
export async function paymentDecisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("payments");
    const id = str(fd, "paymentId");
    const decision = str(fd, "decision");
    const note = str(fd, "note");
    if (decision === "verify") await adminVerifyPayment(id, user.id, note);
    else if (decision === "reject") await adminRejectPayment(id, user.id, note);
    else if (decision === "refund") await adminRefundPayment(id, user.id, note);
    else if (decision === "rescreen") await adminRescreenPayment(id, user.id);
    else throw new UserError("Unknown decision.");
    revalidatePath("/admin/payments");
    revalidatePath(`/admin/payments/${id}`);
    return { message: "Saved." };
  });
}

// ───────────── Listings ─────────────
export async function listingModerationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("listings");
    const id = str(fd, "listingId");
    if (str(fd, "op") === "restore") await adminRestoreListing(id, user.id, str(fd, "reason"));
    else await adminRemoveListing(id, user.id, str(fd, "reason"));
    revalidatePath("/admin/listings");
    return { message: "Listing updated." };
  });
}

// ───────────── Users ─────────────
export async function userModerationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("users");
    const id = str(fd, "userId");
    const op = str(fd, "op");
    const reason = str(fd, "reason");
    if (op === "suspend") await suspendUser(id, user.id, reason, int(fd, "days") || null);
    else if (op === "ban") await banUser(id, user.id, reason);
    else if (op === "reinstate") await reinstateUser(id, user.id, reason);
    else if (op === "clear_review") await clearSellerReview(id, user.id, reason);
    else if (op === "verify_email") {
      await prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
      await audit({ actorId: user.id, action: "user.verify_email", entityType: "User", entityId: id, summary: reason || "Email marked verified by admin" });
    } else throw new UserError("Unknown operation.");
    revalidatePath(`/admin/users/${id}`);
    return { message: "Saved." };
  });
}

export async function adjustStarsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("vip");
    const id = str(fd, "userId");
    const delta = int(fd, "delta");
    const reason = str(fd, "reason");
    if (!delta || !reason.trim()) throw new UserError("Enter a non-zero amount and a reason.");
    await adjustStars(id, delta, reason, user.id);
    await audit({ actorId: user.id, action: "stars.adjust", entityType: "User", entityId: id, summary: `${delta > 0 ? "+" : ""}${delta} Stars: ${reason}` });
    await evaluateVip(id);
    revalidatePath(`/admin/users/${id}`);
    return { message: "Stars adjusted." };
  });
}

export async function setAdminRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("admins");
    await setUserAdminRole(str(fd, "userId"), str(fd, "roleId") || null, user.id);
    revalidatePath("/admin/admins");
    return { message: "Admin access updated." };
  });
}

export async function saveRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("admins");
    await saveAdminRole(user.id, { id: str(fd, "roleId") || undefined, name: str(fd, "name"), description: str(fd, "description"), permissions: fd.getAll("permissions").map(String) });
    revalidatePath("/admin/admins");
    return { message: "Role saved." };
  });
}

// ───────────── Reports ─────────────
export async function reportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("reports");
    await adminHandleReport(str(fd, "reportId"), user.id, str(fd, "status") as ReportStatus, str(fd, "resolution"));
    if (bool(fd, "removeListing") && str(fd, "listingId")) await adminRemoveListing(str(fd, "listingId"), user.id, str(fd, "resolution") || "Removed after report");
    revalidatePath("/admin/reports");
    return { message: "Report updated." };
  });
}

// ───────────── Catalog ─────────────
export async function saveCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("catalog");
    const id = str(fd, "id");
    const name = cleanText(str(fd, "name"), 60);
    if (!name) throw new UserError("Name is required.");
    const imageFileId = await uploadAdminImage(fd, "image", "category_image", user.id, 400);
    const data = { name, slug: slugify(str(fd, "slug") || name), icon: str(fd, "icon") || null, description: str(fd, "description") || null, sortOrder: int(fd, "sortOrder"), isActive: bool(fd, "isActive"), ...(imageFileId ? { imageFileId } : {}), ...(bool(fd, "removeImage") ? { imageFileId: null } : {}) };
    if (id) await prisma.category.update({ where: { id }, data });
    else await prisma.category.create({ data });
    await audit({ actorId: user.id, action: id ? "category.update" : "category.create", entityType: "Category", entityId: id || null, summary: name });
    revalidatePath("/admin/categories");
    return { message: "Category saved." };
  });
}

export async function deleteCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("catalog");
    const id = str(fd, "id");
    const used = await prisma.listing.count({ where: { categoryId: id } });
    if (used > 0) throw new UserError(`This category has ${used} listings. Disable it instead of deleting.`);
    await prisma.category.delete({ where: { id } });
    await audit({ actorId: user.id, action: "category.delete", entityType: "Category", entityId: id, summary: "Deleted category" });
    revalidatePath("/admin/categories");
    return { message: "Category deleted." };
  });
}

export async function saveSubcategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("catalog");
    const id = str(fd, "id");
    const name = cleanText(str(fd, "name"), 60);
    if (!name) throw new UserError("Name is required.");
    const imageFileId = await uploadAdminImage(fd, "image", "category_image", user.id, 400);
    const data = { name, slug: slugify(str(fd, "slug") || name), sortOrder: int(fd, "sortOrder"), isActive: bool(fd, "isActive"), ...(imageFileId ? { imageFileId } : {}) };
    if (id) await prisma.subcategory.update({ where: { id }, data });
    else await prisma.subcategory.create({ data: { ...data, categoryId: str(fd, "categoryId") } });
    await audit({ actorId: user.id, action: id ? "subcategory.update" : "subcategory.create", entityType: "Subcategory", entityId: id || null, summary: name });
    revalidatePath("/admin/categories");
    return { message: "Subcategory saved." };
  });
}

export async function deleteSubcategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("catalog");
    const id = str(fd, "id");
    await prisma.subcategory.delete({ where: { id } });
    await audit({ actorId: user.id, action: "subcategory.delete", entityType: "Subcategory", entityId: id, summary: "Deleted subcategory (listings keep their category)" });
    revalidatePath("/admin/categories");
    return { message: "Subcategory deleted." };
  });
}

export async function saveLocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("catalog");
    const level = str(fd, "level");
    const id = str(fd, "id");
    const name = cleanText(str(fd, "name"), 80);
    if (!name) throw new UserError("Name is required.");
    const common = { name, sortOrder: int(fd, "sortOrder"), isActive: bool(fd, "isActive") };
    if (level === "atoll") {
      const code = cleanText(str(fd, "code"), 10);
      if (!code) throw new UserError("Atoll code is required.");
      if (id) await prisma.atoll.update({ where: { id }, data: { ...common, code } });
      else await prisma.atoll.create({ data: { ...common, code } });
    } else if (level === "island") {
      if (id) await prisma.island.update({ where: { id }, data: common });
      else await prisma.island.create({ data: { ...common, atollId: str(fd, "parentId") } });
    } else if (level === "location") {
      if (id) await prisma.location.update({ where: { id }, data: common });
      else await prisma.location.create({ data: { ...common, islandId: str(fd, "parentId") } });
    } else throw new UserError("Invalid level.");
    await audit({ actorId: user.id, action: `location.${id ? "update" : "create"}`, entityType: level, entityId: id || null, summary: name });
    revalidatePath("/admin/locations");
    return { message: "Saved." };
  });
}

export async function deleteLocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("catalog");
    const level = str(fd, "level");
    const id = str(fd, "id");
    const used =
      level === "atoll" ? await prisma.listing.count({ where: { atollId: id } }) : level === "island" ? await prisma.listing.count({ where: { islandId: id } }) : 0;
    if (used > 0) throw new UserError(`In use by ${used} listings. Disable it instead.`);
    if (level === "atoll") await prisma.atoll.delete({ where: { id } });
    else if (level === "island") await prisma.island.delete({ where: { id } });
    else await prisma.location.delete({ where: { id } });
    await audit({ actorId: user.id, action: "location.delete", entityType: level, entityId: id, summary: "Deleted" });
    revalidatePath("/admin/locations");
    return { message: "Deleted." };
  });
}

// ───────────── Settings ─────────────
export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const group = str(fd, "group") as SettingsGroup;
    const form = SETTINGS_FORMS.find((f) => f.group === group);
    if (!form) throw new UserError("Unknown settings group.");
    const { user } = await requireAdmin(group === "homepage" ? "content" : "settings");
    const current = (await getSettings())[group] as Record<string, unknown>;
    const next: Record<string, unknown> = JSON.parse(JSON.stringify(current));
    for (const f of form.fields) {
      const raw = str(fd, f.key);
      let v: unknown;
      switch (f.type) {
        case "bool": v = bool(fd, f.key); break;
        case "money": v = mvrToLaari(raw || "0"); break;
        case "int": v = Math.trunc(Number(raw)); break;
        case "float":
        case "percent": v = Number(raw); break;
        case "list": v = raw.split("\n").map((s) => s.trim()).filter(Boolean); break;
        default: v = raw;
      }
      setPath(next, f.key, v);
    }
    if (group === "general") {
      const logo = await uploadAdminImage(fd, "logo", "logo", user.id, 256);
      if (logo) next.logoFileId = logo;
      if (bool(fd, "removeLogo")) next.logoFileId = null;
    }
    const parsed = settingsSchema[group].safeParse(next);
    if (!parsed.success) throw new UserError(`Invalid value: ${parsed.error.issues[0]?.path.join(".")} — ${parsed.error.issues[0]?.message}`);
    await updateSettingsGroup(group, parsed.data, user.id);
    await audit({ actorId: user.id, action: "settings.update", entityType: "SiteSetting", entityId: group, summary: `Updated ${form.title} settings`, metadata: { before: current, after: parsed.data } });
    revalidatePath("/", "layout");
    return { message: `${form.title} saved.` };
  });
}

// ───────────── VIP / deals / levels / referrals ─────────────
export async function vipAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("vip");
    const id = str(fd, "userId");
    const reason = str(fd, "reason");
    switch (str(fd, "op")) {
      case "approve": await adminApproveVip(id, user.id, reason); break;
      case "reject": await adminRejectVip(id, user.id, reason); break;
      case "suspend": await adminSuspendVip(id, user.id, reason); break;
      case "restore": await adminRestoreVip(id, user.id, reason); break;
      case "revoke": await adminRevokeVip(id, user.id, reason); break;
      case "evaluate": await recomputeSellerStats(id); await evaluateVip(id); break;
      default: throw new UserError("Unknown operation.");
    }
    revalidatePath("/admin/vip");
    revalidatePath(`/admin/users/${id}`);
    return { message: "VIP status updated." };
  });
}

export async function runVipMaintenanceAction(): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("vip");
    const r = await runVipMaintenance();
    await audit({ actorId: user.id, action: "vip.maintenance", entityType: "VipStatus", summary: `Evaluated ${r.evaluated} users` });
    revalidatePath("/admin/vip");
    return { message: `Evaluated ${r.evaluated} users.` };
  });
}

export async function dealAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("vip");
    await adminReviewDeal(str(fd, "dealId"), user.id, str(fd, "op") as "confirm", str(fd, "reason"));
    revalidatePath("/admin/deals");
    return { message: "Deal updated." };
  });
}

export async function saleProofAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("vip");
    const decision = str(fd, "decision") === "approve" ? "approve" : "reject";
    await reviewSaleProof(str(fd, "dealId"), user.id, decision, str(fd, "note"));
    revalidatePath("/admin/deals");
    return { message: decision === "approve" ? "Sale accepted." : "Proof rejected — the seller was asked for better proof." };
  });
}

export async function saveLevelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("vip");
    const id = str(fd, "id");
    const name = cleanText(str(fd, "name"), 40);
    if (!name) throw new UserError("Name is required.");
    const data = { name, slug: slugify(str(fd, "slug") || name), badge: cleanText(str(fd, "badge"), 8) || "*", color: /^#[0-9a-f]{6}$/i.test(str(fd, "color")) ? str(fd, "color") : "#0e7490", description: str(fd, "description") || null, rewards: str(fd, "rewards") || null, minStars: int(fd, "minStars"), minDeals: int(fd, "minDeals"), sortOrder: int(fd, "sortOrder"), isActive: bool(fd, "isActive") };
    if (id) await prisma.sellerLevel.update({ where: { id }, data });
    else await prisma.sellerLevel.create({ data });
    await audit({ actorId: user.id, action: "level.save", entityType: "SellerLevel", entityId: id || null, summary: `${name}: ${data.minStars} stars / ${data.minDeals} deals` });
    revalidatePath("/admin/levels");
    return { message: "Level saved. Seller levels update as stats are recalculated." };
  });
}

export async function deleteLevelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("vip");
    await prisma.sellerLevel.delete({ where: { id: str(fd, "id") } });
    await audit({ actorId: user.id, action: "level.delete", entityType: "SellerLevel", entityId: str(fd, "id"), summary: "Deleted level" });
    revalidatePath("/admin/levels");
    return { message: "Level deleted." };
  });
}

export async function recomputeAllStatsAction(): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("vip");
    const users = await prisma.user.findMany({ select: { id: true } });
    const settings = await getSettings();
    for (const u of users) await recomputeSellerStats(u.id, settings);
    await audit({ actorId: user.id, action: "stats.recompute_all", entityType: "SellerStatistics", summary: `Recomputed ${users.length} users` });
    return { message: `Recalculated statistics for ${users.length} users.` };
  });
}

export async function referralAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("vip");
    const status = str(fd, "status") as "VERIFIED" | "REJECTED";
    await adminSetReferralStatus(str(fd, "referralId"), status, str(fd, "reason") || `Reviewed by admin`);
    await audit({ actorId: user.id, action: `referral.${status.toLowerCase()}`, entityType: "Referral", entityId: str(fd, "referralId"), summary: str(fd, "reason") || status });
    revalidatePath("/admin/referrals");
    return { message: "Referral updated." };
  });
}

// ───────────── Cancellations ─────────────
export async function cancellationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("cancellations");
    await adminResolveCancellation(str(fd, "cancellationId"), user.id, str(fd, "op") as "waive_fine", str(fd, "reason"));
    revalidatePath("/admin/cancellations");
    return { message: "Cancellation updated." };
  });
}

// ───────────── Rewards ─────────────
export async function savePoolAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(async () => {
    const { user } = await requireAdmin("rewards");
    const pool = await createOrUpdatePool({ month: str(fd, "month"), eligibleProfit: mvrToLaari(str(fd, "eligibleProfit") || "0"), rewardPercent: Number(str(fd, "rewardPercent")), profitNote: str(fd, "profitNote") }, user.id);
    id = pool.id;
  });
  if (res?.error) return res;
  redirect(`/admin/rewards/${id}`);
}

export async function poolAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("rewards");
    const poolId = str(fd, "poolId");
    const op = str(fd, "op");
    if (op === "calculate") await calculatePool(poolId, user.id);
    else if (op === "approve") await approvePool(poolId, user.id);
    else throw new UserError("Unknown operation.");
    revalidatePath(`/admin/rewards/${poolId}`);
    return { message: op === "calculate" ? "Rewards calculated." : "Pool approved." };
  });
}

export async function allocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("rewards");
    const id = str(fd, "allocationId");
    const op = str(fd, "op");
    if (op === "adjust") await adjustAllocation(id, user.id, mvrToLaari(str(fd, "adjustment") || "0"), str(fd, "reason"));
    else if (op === "withhold") await setAllocationWithheld(id, user.id, true, str(fd, "reason"));
    else if (op === "release") await setAllocationWithheld(id, user.id, false, str(fd, "reason"));
    else if (op === "pay") await recordRewardPayment(id, user.id, { method: str(fd, "method"), reference: str(fd, "reference"), paidAt: str(fd, "paidAt") ? parseMvDateTime(str(fd, "paidAt")) : new Date(), note: str(fd, "note") });
    else throw new UserError("Unknown operation.");
    revalidatePath(`/admin/rewards/${str(fd, "poolId")}`);
    return { message: "Saved." };
  });
}

export async function revenueEntryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("finance");
    const amount = mvrToLaari(str(fd, "amount") || "0");
    if (!amount) throw new UserError("Enter an amount.");
    const category = cleanText(str(fd, "category"), 40) || "Other";
    await prisma.revenueEntry.create({ data: { category, amount, note: str(fd, "note") || null, occurredAt: str(fd, "occurredAt") ? parseMvDateTime(str(fd, "occurredAt")) : new Date(), createdById: user.id } });
    await audit({ actorId: user.id, action: "revenue.entry", entityType: "RevenueEntry", summary: `${category}: ${amount / 100} MVR` });
    revalidatePath("/admin");
    return { message: "Recorded." };
  });
}

// ───────────── Businesses & plans ─────────────
export async function businessAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("businesses");
    const id = str(fd, "businessId");
    const op = str(fd, "op");
    if (op === "verify") await adminSetBusinessVerified(id, user.id, true);
    else if (op === "unverify") await adminSetBusinessVerified(id, user.id, false);
    else if (op === "suspend") await adminSetBusinessStatus(id, user.id, "SUSPENDED", str(fd, "reason"));
    else if (op === "activate") await adminSetBusinessStatus(id, user.id, "ACTIVE", str(fd, "reason") || "Reactivated");
    else throw new UserError("Unknown operation.");
    revalidatePath("/admin/businesses");
    return { message: "Business updated." };
  });
}

export async function savePlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("businesses");
    const id = str(fd, "id");
    const name = cleanText(str(fd, "name"), 60);
    if (!name) throw new UserError("Name is required.");
    const data = {
      name,
      description: str(fd, "description") || null,
      price: mvrToLaari(str(fd, "price") || "0"),
      durationDays: Math.max(1, int(fd, "durationDays", 30)),
      freeListingsPerPeriod: Math.max(0, int(fd, "freeListingsPerPeriod")),
      featuredSlots: Math.max(0, int(fd, "featuredSlots")),
      features: str(fd, "features").split("\n").map((s) => s.trim()).filter(Boolean),
      isActive: bool(fd, "isActive"),
      sortOrder: int(fd, "sortOrder"),
    };
    if (id) await prisma.subscriptionPlan.update({ where: { id }, data });
    else await prisma.subscriptionPlan.create({ data });
    await audit({ actorId: user.id, action: "plan.save", entityType: "SubscriptionPlan", entityId: id || null, summary: `${name} ${data.price / 100} MVR / ${data.durationDays}d` });
    revalidatePath("/admin/businesses");
    return { message: "Plan saved." };
  });
}

// ───────────── Giveaways ─────────────
export async function saveGiveawayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("giveaways");
    const id = str(fd, "id");
    const title = cleanText(str(fd, "title"), 120);
    const startsAt = parseMvDateTime(str(fd, "startsAt"));
    const endsAt = parseMvDateTime(str(fd, "endsAt"));
    if (!title || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new UserError("Enter a title and a valid start/end date.");
    const imageFileId = await uploadAdminImage(fd, "image", "giveaway", user.id);
    const data = {
      title,
      description: cleanText(str(fd, "description"), 3000),
      prize: cleanText(str(fd, "prize"), 200),
      startsAt,
      endsAt,
      status: (str(fd, "status") || "DRAFT") as "DRAFT",
      vipOnly: bool(fd, "vipOnly"),
      minStars: int(fd, "minStars"),
      winnersCount: Math.max(1, int(fd, "winnersCount", 1)),
      ...(imageFileId ? { imageFileId } : {}),
    };
    if (id) await prisma.giveaway.update({ where: { id }, data });
    else await prisma.giveaway.create({ data });
    await audit({ actorId: user.id, action: "giveaway.save", entityType: "Giveaway", entityId: id || null, summary: title });
    revalidatePath("/admin/giveaways");
    return { message: "Giveaway saved." };
  });
}

export async function drawGiveawayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("giveaways");
    const winners = await drawWinners(str(fd, "id"), user.id);
    revalidatePath("/admin/giveaways");
    return { message: `Drew ${winners.length} winner(s).` };
  });
}

export async function deleteGiveawayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("giveaways");
    await deleteGiveaway(str(fd, "id"), user.id);
    revalidatePath("/admin/giveaways");
    revalidatePath("/giveaways");
    revalidatePath("/");
    return { message: "Giveaway deleted." };
  });
}

// ───────────── Content ─────────────
export async function saveBannerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("content");
    const id = str(fd, "id");
    const imageFileId = await uploadAdminImage(fd, "image", "banner", user.id, 1600);
    const link = normalizeAdLink(str(fd, "linkUrl"));
    const data = {
      title: cleanText(str(fd, "title"), 100),
      subtitle: cleanText(str(fd, "subtitle"), 200) || null,
      linkUrl: link,
      label: cleanText(str(fd, "label"), 30) || null,
      ctaText: cleanText(str(fd, "ctaText"), 30) || null,
      background: /^#[0-9a-f]{6}$/i.test(str(fd, "background")) ? str(fd, "background") : "#0e7490",
      sortOrder: int(fd, "sortOrder"),
      isActive: bool(fd, "isActive"),
      startsAt: str(fd, "startsAt") ? parseMvDateTime(str(fd, "startsAt")) : null,
      endsAt: str(fd, "endsAt") ? parseMvDateTime(str(fd, "endsAt")) : null,
      ...(imageFileId ? { imageFileId } : {}),
      ...(bool(fd, "removeImage") ? { imageFileId: null } : {}),
    };
    if (!data.title) throw new UserError("Title is required.");
    if (id) await prisma.banner.update({ where: { id }, data });
    else await prisma.banner.create({ data });
    await audit({ actorId: user.id, action: "banner.save", entityType: "Banner", entityId: id || null, summary: data.title });
    revalidatePath("/admin/content");
    revalidatePath("/");
    return { message: "Banner saved." };
  });
}

export async function deleteBannerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("content");
    await prisma.banner.delete({ where: { id: str(fd, "id") } });
    await audit({ actorId: user.id, action: "banner.delete", entityType: "Banner", entityId: str(fd, "id"), summary: "Deleted banner" });
    revalidatePath("/admin/content");
    revalidatePath("/");
    return { message: "Banner deleted." };
  });
}

/** Publishing a new Terms/Privacy version makes every user re-accept on their next visit. */
export async function publishTermsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await requireAdmin("content");
    const type = str(fd, "type") as TermsType;
    if (!["TERMS", "PRIVACY"].includes(type)) throw new UserError("Invalid document.");
    const content = str(fd, "content").trim();
    if (content.length < 20) throw new UserError("Content is too short.");
    const last = await prisma.termsDocument.findFirst({ where: { type }, orderBy: { version: "desc" } });
    await prisma.$transaction([
      prisma.termsDocument.updateMany({ where: { type }, data: { isCurrent: false } }),
      prisma.termsDocument.create({ data: { type, version: (last?.version ?? 0) + 1, title: str(fd, "title") || (type === "TERMS" ? "Terms of Use" : "Privacy Policy"), content, isCurrent: true, createdById: user.id } }),
    ]);
    await audit({ actorId: user.id, action: "terms.publish", entityType: "TermsDocument", summary: `Published ${type} v${(last?.version ?? 0) + 1}` });
    revalidatePath("/terms");
    revalidatePath("/privacy");
    return { message: "New version published. Users will be asked to accept it." };
  });
}
