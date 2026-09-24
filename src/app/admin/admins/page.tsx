import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/permissions";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageTitle, Section, TableWrap } from "@/components/admin/ui";
import { setAdminRoleAction, saveRoleAction } from "@/app/actions/admin";

type Role = { id: string; name: string; description: string | null; permissions: string[]; isSystem: boolean };

function RoleForm({ r }: { r?: Role }) {
  return (
    <ActionForm action={saveRoleAction}>
      <input type="hidden" name="roleId" value={r?.id ?? ""} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="name" defaultValue={r?.name} required className="input" placeholder="Role name" disabled={r?.isSystem} />
        <input name="description" defaultValue={r?.description ?? ""} className="input" placeholder="Description" disabled={r?.isSystem} />
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {Object.entries(PERMISSIONS).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="permissions" value={k} defaultChecked={r?.permissions.includes(k) || r?.permissions.includes("*")} disabled={r?.isSystem} className="h-4 w-4" /> {label}
          </label>
        ))}
      </div>
      {!r?.isSystem && <SubmitButton className="btn-primary btn-sm">{r ? "Save role" : "Create role"}</SubmitButton>}
    </ActionForm>
  );
}

export default async function AdminAdminsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user } = await requireAdminPage("admins");
  const sp = await searchParams;
  const [roles, admins, found] = await Promise.all([
    prisma.adminRole.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } }),
    prisma.user.findMany({ where: { adminRoleId: { not: null } }, include: { adminRole: true } }),
    sp.q ? prisma.user.findMany({ where: { email: { contains: sp.q.trim(), mode: "insensitive" } }, take: 10, include: { adminRole: true } }) : [],
  ]);
  const RoleSelect = ({ userId, current }: { userId: string; current: string | null }) => (
    <ActionForm action={setAdminRoleAction}>
      <input type="hidden" name="userId" value={userId} />
      <div className="flex gap-1">
        <select name="roleId" defaultValue={current ?? ""} className="input">
          <option value="">No admin access</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <SubmitButton className="btn-secondary btn-sm" confirm="Change this user's admin access?">Save</SubmitButton>
      </div>
    </ActionForm>
  );
  return (
    <>
      <PageTitle title="Admins & roles" />
      <p className="text-sm text-slate-600">Admins sign in with their password plus a one-time code sent by email. Admin access is checked on the server for every page and action.</p>
      <Section title="Current admins">
        <TableWrap>
          <table className="table">
            <thead><tr><th>User</th><th>Role</th><th>Change</th></tr></thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/admin/users/${a.id}`} className="underline">{a.name}</Link><span className="block text-xs text-slate-500">{a.email}</span></td>
                  <td>{a.adminRole?.name}</td>
                  <td>{a.id === user.id ? <span className="text-xs text-slate-500">(you)</span> : <RoleSelect userId={a.id} current={a.adminRoleId} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <form className="mt-3 flex gap-2">
          <input name="q" defaultValue={sp.q} className="input" placeholder="Find a user by email to grant access" />
          <button className="btn-secondary">Find</button>
        </form>
        {found.map((f) => (
          <div key={f.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2 text-sm">
            <span>{f.name} · {f.email} {f.emailVerifiedAt ? "" : "(email not verified)"}</span>
            {f.id !== user.id && <RoleSelect userId={f.id} current={f.adminRoleId} />}
          </div>
        ))}
      </Section>
      {roles.map((r) => (
        <Section key={r.id} title={`${r.name} · ${r._count.users} admins${r.isSystem ? " · system role" : ""}`}><RoleForm r={r} /></Section>
      ))}
      <Section title="New role"><RoleForm /></Section>
    </>
  );
}
