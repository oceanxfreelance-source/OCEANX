import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/guards";
import { hasPermission, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "OceanX Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV: { href: string; label: string; perm: Permission }[] = [
  { href: "/admin", label: "📊 Dashboard", perm: "dashboard" },
  { href: "/admin/payments", label: "💳 Payments", perm: "payments" },
  { href: "/admin/listings", label: "📦 Listings", perm: "listings" },
  { href: "/admin/reports", label: "⚑ Reports", perm: "reports" },
  { href: "/admin/users", label: "👥 Users", perm: "users" },
  { href: "/admin/vip", label: "👑 VIP", perm: "vip" },
  { href: "/admin/deals", label: "🤝 Deals", perm: "vip" },
  { href: "/admin/levels", label: "🏅 Seller levels", perm: "vip" },
  { href: "/admin/referrals", label: "🔗 Referrals", perm: "vip" },
  { href: "/admin/rewards", label: "🎁 VIP rewards", perm: "rewards" },
  { href: "/admin/cancellations", label: "↩️ Cancellations", perm: "cancellations" },
  { href: "/admin/categories", label: "🗂️ Categories", perm: "catalog" },
  { href: "/admin/locations", label: "📍 Locations", perm: "catalog" },
  { href: "/admin/businesses", label: "🏪 Businesses", perm: "businesses" },
  { href: "/admin/giveaways", label: "🎉 Giveaways", perm: "giveaways" },
  { href: "/admin/content", label: "📰 Homepage & terms", perm: "content" },
  { href: "/admin/settings", label: "⚙️ Settings", perm: "settings" },
  { href: "/admin/audit", label: "📜 Audit log", perm: "audit" },
  { href: "/admin/admins", label: "🔐 Admins & roles", perm: "admins" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, permissions } = await requireAdminPage();
  const [pendingPayments, openReports] = await Promise.all([
    hasPermission(permissions, "payments") ? prisma.payment.count({ where: { status: { in: ["PENDING", "NEEDS_REVIEW", "AI_CHECKING"] } } }) : 0,
    hasPermission(permissions, "reports") ? prisma.report.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } }) : 0,
  ]);
  const badge: Record<string, number> = { "/admin/payments": pendingPayments, "/admin/reports": openReports };
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="mb-2 rounded-xl bg-slate-900 px-3 py-2 text-xs text-slate-300">
          OceanX Admin · <span className="font-semibold text-white">{user.name}</span>
          <br />
          {user.adminRole?.name}
        </div>
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0" aria-label="Admin">
          {NAV.filter((n) => hasPermission(permissions, n.perm)).map((n) => (
            <Link key={n.href} href={n.href} className="flex shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white hover:shadow-sm">
              {n.label}
              {badge[n.href] ? <span className="rounded-full bg-coral-500 px-1.5 text-xs font-bold text-white">{badge[n.href]}</span> : null}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  );
}
