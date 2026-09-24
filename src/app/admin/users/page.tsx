import Link from "next/link";
import type { Prisma, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatDate } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { FilterLinks, PageTitle, TableWrap } from "@/components/admin/ui";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; review?: string }> }) {
  await requireAdminPage("users");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const where: Prisma.UserWhereInput = {
    ...(sp.status && ["ACTIVE", "SUSPENDED", "BANNED"].includes(sp.status) ? { status: sp.status as UserStatus } : {}),
    ...(sp.review === "1" ? { sellerStats: { underReview: true } } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { id: q }] } : {}),
  };
  const users = await prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { sellerStats: true, vipStatus: true, adminRole: { select: { name: true } } } });
  return (
    <>
      <PageTitle title="Users" />
      <FilterLinks base="/admin/users" current={sp.review === "1" ? "review" : sp.status ?? ""} options={[{ value: "", label: "All" }, { value: "SUSPENDED", label: "Suspended" }, { value: "BANNED", label: "Banned" }]} />
      <Link href="/admin/users?review=1" className="btn-secondary btn-sm">Flagged for review</Link>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} className="input" placeholder="Search name, email, phone or ID" />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card p-2">
        <TableWrap>
          <table className="table">
            <thead><tr><th>User</th><th>Status</th><th>Stars</th><th>Deals</th><th>Cancels</th><th>VIP</th><th>Joined</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><Link href={`/admin/users/${u.id}`} className="font-medium underline">{u.name}</Link><span className="block text-xs text-slate-500">{u.email}{u.adminRole ? ` · ${u.adminRole.name}` : ""}</span></td>
                  <td><StatusBadge status={u.status} />{u.sellerStats?.underReview && <span className="chip ml-1 bg-amber-100 text-amber-800">review</span>}</td>
                  <td>{u.sellerStats?.stars ?? 0}</td>
                  <td>{u.sellerStats?.countedDeals ?? 0}</td>
                  <td>{u.sellerStats?.voluntaryCancellations ?? 0}</td>
                  <td><StatusBadge status={u.vipStatus?.state ?? "NONE"} /></td>
                  <td className="whitespace-nowrap">{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </>
  );
}
