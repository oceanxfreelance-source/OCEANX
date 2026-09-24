import Link from "next/link";
import type { ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/dates";
import { REPORT_REASONS } from "@/lib/services/reports";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { FilterLinks, PageTitle } from "@/components/admin/ui";
import { reportAction } from "@/app/actions/admin";

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage("reports");
  const sp = await searchParams;
  const statuses: ReportStatus[] = sp.status === "closed" ? ["RESOLVED", "DISMISSED"] : ["OPEN", "REVIEWING"];
  const reports = await prisma.report.findMany({
    where: { status: { in: statuses } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { reporter: { select: { id: true, name: true } }, listing: { select: { id: true, title: true, status: true } }, targetUser: { select: { id: true, name: true } }, handledBy: { select: { name: true } } },
  });
  return (
    <>
      <PageTitle title="Reports" />
      <FilterLinks base="/admin/reports" current={sp.status === "closed" ? "closed" : ""} options={[{ value: "", label: "Open" }, { value: "closed", label: "Closed" }]} />
      <div className="space-y-3">
        {reports.length === 0 && <p className="card p-6 text-center text-slate-500">No reports.</p>}
        {reports.map((r) => (
          <div key={r.id} className="card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{REPORT_REASONS.find((x) => x.value === r.reason)?.label}</p>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-slate-600">
              {r.listing && <>Listing: <Link href={`/listing/${r.listing.id}`} className="underline">{r.listing.title}</Link> ({r.listing.status.toLowerCase()}) · </>}
              {r.targetUser && <>Seller: <Link href={`/admin/users/${r.targetUser.id}`} className="underline">{r.targetUser.name}</Link> · </>}
              Reported by <Link href={`/admin/users/${r.reporter.id}`} className="underline">{r.reporter.name}</Link> · {formatDateTime(r.createdAt)}
            </p>
            {r.details && <p className="mt-1 rounded-lg bg-slate-50 p-2">{r.details}</p>}
            {r.resolution && <p className="mt-1 text-slate-600">Resolution: {r.resolution} {r.handledBy && `(${r.handledBy.name})`}</p>}
            {statuses.includes("OPEN") && (
              <ActionForm action={reportAction} className="mt-2">
                <input type="hidden" name="reportId" value={r.id} />
                <input type="hidden" name="listingId" value={r.listing?.id ?? ""} />
                <input name="resolution" className="input" placeholder="Resolution note" />
                {r.listing?.status === "PUBLISHED" && (
                  <label className="flex items-center gap-2"><input type="checkbox" name="removeListing" className="h-4 w-4" /> Also remove the listing (no fine for seller)</label>
                )}
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="status" value="RESOLVED" className="btn-primary btn-sm">Resolve</SubmitButton>
                  <SubmitButton name="status" value="REVIEWING" className="btn-secondary btn-sm">Mark reviewing</SubmitButton>
                  <SubmitButton name="status" value="DISMISSED" className="btn-ghost btn-sm">Dismiss</SubmitButton>
                </div>
              </ActionForm>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
