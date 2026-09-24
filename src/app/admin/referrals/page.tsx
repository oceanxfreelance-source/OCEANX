import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatDate } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageTitle, TableWrap } from "@/components/admin/ui";
import { referralAction } from "@/app/actions/admin";

export default async function AdminReferralsPage() {
  await requireAdminPage("vip");
  const refs = await prisma.referral.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 300, include: { referrer: { select: { id: true, name: true } }, referred: { select: { id: true, name: true, emailVerifiedAt: true, _count: { select: { listings: { where: { publishedAt: { not: null } } } } } } } } });
  return (
    <>
      <PageTitle title="Referrals" />
      <p className="text-sm text-slate-600">Referrals verify automatically once the new member is genuinely active. Referrals flagged as same-network wait here for a decision.</p>
      <div className="card p-2">
        <TableWrap>
          <table className="table">
            <thead><tr><th>Referrer</th><th>New member</th><th>Activity</th><th>Status</th><th>Joined</th><th>Decision</th></tr></thead>
            <tbody>
              {refs.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/admin/users/${r.referrer.id}`} className="underline">{r.referrer.name}</Link></td>
                  <td><Link href={`/admin/users/${r.referred.id}`} className="underline">{r.referred.name}</Link></td>
                  <td className="text-xs">{r.referred.emailVerifiedAt ? "Email ✓" : "Email ✗"} · {r.referred._count.listings} published</td>
                  <td><StatusBadge status={r.status} />{r.reason && <span className="block text-xs text-amber-800">{r.reason}</span>}</td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td className="min-w-48">
                    {r.status === "PENDING" && (
                      <ActionForm action={referralAction}>
                        <input type="hidden" name="referralId" value={r.id} />
                        <input name="reason" className="input" placeholder="Reason" />
                        <div className="flex gap-1">
                          <SubmitButton name="status" value="VERIFIED" className="btn-primary btn-sm">Verify</SubmitButton>
                          <SubmitButton name="status" value="REJECTED" className="btn-ghost btn-sm">Reject</SubmitButton>
                        </div>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </>
  );
}
