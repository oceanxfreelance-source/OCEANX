import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/dates";
import { PageTitle, TableWrap } from "@/components/admin/ui";
import { Pagination } from "@/components/Pagination";

const PAGE = 100;

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ q?: string; action?: string; page?: string }> }) {
  await requireAdminPage("audit");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.action ? { action: { startsWith: sp.action } } : {}),
    ...(sp.q ? { OR: [{ summary: { contains: sp.q, mode: "insensitive" } }, { entityId: sp.q }, { actor: { email: { contains: sp.q, mode: "insensitive" } } }] } : {}),
  };
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { actor: { select: { id: true, name: true } } } }),
  ]);
  return (
    <>
      <PageTitle title="Audit log" />
      <form className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
        <input name="q" defaultValue={sp.q} className="input" placeholder="Search summary, entity ID or actor email" />
        <select name="action" defaultValue={sp.action ?? ""} className="input">
          <option value="">All actions</option>
          {["payment", "listing", "user", "vip", "stars", "deal", "rewards", "cancellation", "settings", "category", "location", "business", "plan", "giveaway", "banner", "terms", "admin", "report", "referral", "revenue", "level"].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card p-2">
        <TableWrap>
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Summary</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-xs">{formatDateTime(l.createdAt)}</td>
                  <td>{l.actor ? <Link href={`/admin/users/${l.actor.id}`} className="underline">{l.actor.name}</Link> : "system"}</td>
                  <td className="font-mono text-xs">{l.action}</td>
                  <td className="text-xs">{l.entityType}<span className="block font-mono text-slate-400">{l.entityId}</span></td>
                  <td className="max-w-md text-sm">{l.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE))} params={{ ...(sp.q ? { q: sp.q } : {}), ...(sp.action ? { action: sp.action } : {}) }} basePath="/admin/audit" />
    </>
  );
}
