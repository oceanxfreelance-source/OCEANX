import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions";
import { vipEligibility } from "@/lib/services/vip";
import { formatMVR } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { StatusBadge, LevelBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageTitle, Section, Stat, TableWrap } from "@/components/admin/ui";
import { userModerationAction, adjustStarsAction, vipAction } from "@/app/actions/admin";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { permissions } = await requireAdminPage("users");
  const { id } = await params;
  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      sellerStats: { include: { level: true } },
      vipStatus: true,
      adminRole: true,
      profile: true,
      referredBy: { select: { id: true, name: true } },
      businesses: { select: { id: true, name: true } },
    },
  });
  if (!u) notFound();
  const canVip = hasPermission(permissions, "vip");
  const [elig, listings, deals, cancellations, vipHistory, stars, payments] = await Promise.all([
    canVip ? vipEligibility(id) : null,
    prisma.listing.groupBy({ by: ["status"], where: { sellerId: id }, _count: true }),
    prisma.successfulDeal.findMany({ where: { sellerId: id }, orderBy: { createdAt: "desc" }, take: 20, include: { listing: { select: { title: true } }, buyer: { select: { name: true } } } }),
    prisma.cancellationRecord.findMany({ where: { sellerId: id }, orderBy: { createdAt: "desc" }, take: 20, include: { listing: { select: { title: true } }, fine: true } }),
    prisma.vipHistory.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20, include: { actor: { select: { name: true } } } }),
    prisma.starAdjustment.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20, include: { actor: { select: { name: true } } } }),
    prisma.payment.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const s = u.sellerStats;
  return (
    <>
      <PageTitle title={u.name}>
        <div className="flex gap-2">
          <StatusBadge status={u.status} />
          {u.adminRole && <span className="chip bg-ink text-white">{u.adminRole.name}</span>}
        </div>
      </PageTitle>
      <Section title="Account">
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          <div>Email: <strong>{u.email}</strong> {u.emailVerifiedAt ? "(verified)" : "(unverified)"}</div>
          <div>Phone: <strong>{u.phone ?? "—"}</strong> {u.phoneVerifiedAt ? "(verified)" : ""}</div>
          <div>Joined: {formatDateTime(u.createdAt)}</div>
          <div>Last active: {formatDateTime(u.lastActiveAt)}</div>
          <div>Referral code: <span className="font-mono">{u.referralCode}</span></div>
          <div>Referred by: {u.referredBy ? <Link href={`/admin/users/${u.referredBy.id}`} className="underline">{u.referredBy.name}</Link> : "—"}</div>
          {u.suspendedReason && <div className="sm:col-span-2 text-red-700">Suspension: {u.suspendedReason} {u.suspendedUntil && `(until ${formatDate(u.suspendedUntil)})`}</div>}
          <div className="sm:col-span-2">Listings: {listings.map((l) => `${l._count} ${l.status.toLowerCase()}`).join(", ") || "none"} · <Link href={`/seller/${u.id}`} className="underline">public profile</Link></div>
          {u.businesses.length > 0 && <div className="sm:col-span-2">Businesses: {u.businesses.map((b) => b.name).join(", ")}</div>}
        </dl>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ActionForm action={userModerationAction}>
            <input type="hidden" name="userId" value={u.id} />
            <input name="reason" required className="input" placeholder="Reason (required)" />
            <div className="flex flex-wrap gap-2">
              {u.status === "ACTIVE" ? (
                <>
                  <input name="days" type="number" min={1} className="input w-28" placeholder="Days" />
                  <SubmitButton name="op" value="suspend" className="btn-secondary btn-sm">Suspend</SubmitButton>
                  <SubmitButton name="op" value="ban" className="btn-danger btn-sm" confirm="Permanently ban this user and remove their live listings?">Ban</SubmitButton>
                </>
              ) : (
                <SubmitButton name="op" value="reinstate" className="btn-primary btn-sm">Reinstate</SubmitButton>
              )}
              {!u.emailVerifiedAt && <SubmitButton name="op" value="verify_email" className="btn-ghost btn-sm">Mark email verified</SubmitButton>}
              {s?.underReview && <SubmitButton name="op" value="clear_review" className="btn-ghost btn-sm">Clear review flag</SubmitButton>}
            </div>
          </ActionForm>
        </div>
      </Section>

      <Section title="Reputation">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Stars" value={s?.stars ?? 0} />
          <Stat label="Counted deals" value={s?.countedDeals ?? 0} sub={`${s?.countedDealsInWindow ?? 0} recent · ${s?.pendingDeals ?? 0} pending`} />
          <Stat label="Voluntary cancellations" value={s?.voluntaryCancellations ?? 0} sub={`${s?.cancellationsInWindow ?? 0} in period`} />
          <Stat label="Verified referrals" value={s?.verifiedReferrals ?? 0} />
        </div>
        <div className="mt-2"><LevelBadge level={s?.level} /> {s?.underReview && <span className="chip bg-amber-100 text-amber-800">Flagged for review</span>}</div>
        {canVip && (
          <ActionForm action={adjustStarsAction} className="mt-3">
            <input type="hidden" name="userId" value={u.id} />
            <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
              <input name="delta" type="number" required className="input" placeholder="+/- Stars" />
              <input name="reason" required className="input" placeholder="Reason (audited)" />
              <SubmitButton className="btn-secondary">Adjust Stars</SubmitButton>
            </div>
          </ActionForm>
        )}
        {stars.length > 0 && (
          <ul className="mt-2 text-xs text-slate-600">
            {stars.map((a) => <li key={a.id}>{a.delta > 0 ? "+" : ""}{a.delta} · {a.reason} · {a.actor?.name} · {formatDate(a.createdAt)}</li>)}
          </ul>
        )}
      </Section>

      {canVip && elig && (
        <Section title="VIP">
          <p className="text-sm">
            State: <StatusBadge status={u.vipStatus?.state ?? "NONE"} /> {u.vipStatus?.expiresAt && `· expires ${formatDate(u.vipStatus.expiresAt)}`} {u.vipStatus?.renewals ? `· renewed ${u.vipStatus.renewals}×` : ""}
            {u.vipStatus?.suspendedReason && <span className="text-red-700"> · {u.vipStatus.suspendedReason}</span>}
          </p>
          <ul className="mt-2 text-sm">
            {elig.requirements.map((r) => <li key={r.label}><span className={r.met ? "text-emerald-600" : "text-red-600"}>{r.met ? "Met" : "Not met"}</span> · {r.label}: {r.current} ({r.kind === "min" ? "min" : "max"} {r.required})</li>)}
          </ul>
          <ActionForm action={vipAction} className="mt-3">
            <input type="hidden" name="userId" value={u.id} />
            <input name="reason" className="input" placeholder="Reason (required for manual changes)" />
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="op" value="evaluate" className="btn-secondary btn-sm">Re-evaluate</SubmitButton>
              {u.vipStatus?.state === "PENDING_APPROVAL" && <SubmitButton name="op" value="approve" className="btn-primary btn-sm">Approve VIP</SubmitButton>}
              {u.vipStatus?.state === "PENDING_APPROVAL" && <SubmitButton name="op" value="reject" className="btn-ghost btn-sm">Reject</SubmitButton>}
              {u.vipStatus?.state === "ACTIVE" && <SubmitButton name="op" value="suspend" className="btn-danger btn-sm">Suspend VIP</SubmitButton>}
              {["SUSPENDED", "EXPIRED", "NONE"].includes(u.vipStatus?.state ?? "NONE") && <SubmitButton name="op" value="restore" className="btn-secondary btn-sm">Restore / grant VIP</SubmitButton>}
              {u.vipStatus?.state && u.vipStatus.state !== "NONE" && <SubmitButton name="op" value="revoke" className="btn-ghost btn-sm">Revoke</SubmitButton>}
            </div>
          </ActionForm>
          {vipHistory.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 text-xs">
              {vipHistory.map((h) => <li key={h.id} className="py-1">{formatDateTime(h.createdAt)} · <strong>{h.event}</strong> · {h.reason} {h.actor && `· by ${h.actor.name}`}</li>)}
            </ul>
          )}
        </Section>
      )}

      <Section title="Recent deals">
        <TableWrap>
          <table className="table">
            <thead><tr><th>Listing</th><th>Buyer</th><th>Price</th><th>Status</th><th>Counts</th><th>Date</th></tr></thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id}><td>{d.listing.title}</td><td>{d.buyer?.name ?? "—"}</td><td>{formatMVR(d.price)}</td><td><StatusBadge status={d.status} /></td><td>{d.countsTowardStats ? "Yes" : <span className="text-xs text-slate-500">No — {d.ineligibleReason}</span>}</td><td>{formatDate(d.createdAt)}</td></tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Section>

      <Section title="Cancellations">
        <TableWrap>
          <table className="table">
            <thead><tr><th>Listing</th><th>Fine</th><th>Outcome</th><th>Counts</th><th>Date</th></tr></thead>
            <tbody>
              {cancellations.map((c) => (
                <tr key={c.id}><td>{c.listing.title}</td><td>{formatMVR(c.fineAmount)} {c.fine && <StatusBadge status={c.fine.status} />}</td><td>{c.outcome}</td><td>{c.countsAgainstSeller ? "Yes" : "No"}</td><td>{formatDate(c.createdAt)}</td></tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <Link href="/admin/cancellations" className="mt-2 inline-block text-sm text-ocean-700 underline">Manage cancellations</Link>
      </Section>

      {hasPermission(permissions, "payments") && (
        <Section title="Payments">
          <TableWrap>
            <table className="table">
              <thead><tr><th>Date</th><th>Purpose</th><th>Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}><td>{formatDateTime(p.createdAt)}</td><td>{p.purpose}</td><td>{formatMVR(p.amount)}</td><td><StatusBadge status={p.status} /></td><td><Link href={`/admin/payments/${p.id}`} className="underline">View</Link></td></tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Section>
      )}
    </>
  );
}
