import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { getSiteSettings } from "@/lib/site";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";

export const metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  const user = await requireUser("/account/referrals");
  const settings = await getSiteSettings();
  const referrals = await prisma.referral.findMany({ where: { referrerId: user.id }, orderBy: { createdAt: "desc" }, include: { referred: { select: { name: true } } } });
  const link = `${env.appUrl}/register?ref=${user.referralCode}`;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Invite friends</h1>
      <div className="card space-y-2 p-4">
        <p className="text-sm text-slate-600">Your referral code</p>
        <p className="select-all font-mono text-2xl font-bold tracking-widest">{user.referralCode}</p>
        <p className="select-all break-all rounded-xl bg-slate-50 p-2 text-sm">{link}</p>
        <a href={`https://wa.me/?text=${encodeURIComponent(`Join me on MV Markets — buy & sell across the Maldives: ${link}`)}`} target="_blank" rel="noopener noreferrer" className="btn bg-emerald-600 text-white">Share on WhatsApp</a>
        <p className="text-xs text-slate-500">
          {settings.referrals.enabled
            ? `Each genuine friend who becomes an active seller earns you ${settings.referrals.starsPerVerifiedReferral} Star${settings.referrals.starsPerVerifiedReferral === 1 ? "" : "s"}.`
            : "Referral rewards are not active right now, but your verified referrals are still recorded."}{" "}
          Referrals only count once your friend verifies their account{settings.referrals.requireReferredPublishedListing ? " and publishes their first listing" : ""}. Fake accounts are never counted.
        </p>
      </div>
      <div className="card p-4">
        <h2 className="font-bold">Your referrals ({referrals.filter((r) => r.status === "VERIFIED").length} verified)</h2>
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {referrals.length === 0 && <li className="py-2 text-slate-500">No referrals yet.</li>}
          {referrals.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span>{r.referred.name} <span className="text-xs text-slate-400">joined {formatDate(r.createdAt)}</span></span>
              <StatusBadge status={r.status} labels={{ PENDING: "Pending activity" }} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
