import Link from "next/link";
import { Award, CreditCard, Crown, Flag, FolderTree, Gift, Handshake, KeyRound, LayoutDashboard, Link2, MapPin, Newspaper, Package, PartyPopper, ScrollText, Settings, Store, Undo2, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/guards";
import { hasPermission, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "OceanX Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV: { href: string; label: string; Icon: LucideIcon; perm: Permission }[] = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard, perm: "dashboard" },
  { href: "/admin/payments", label: "Payments", Icon: CreditCard, perm: "payments" },
  { href: "/admin/listings", label: "Listings", Icon: Package, perm: "listings" },
  { href: "/admin/reports", label: "Reports", Icon: Flag, perm: "reports" },
  { href: "/admin/users", label: "Users", Icon: Users, perm: "users" },
  { href: "/admin/vip", label: "VIP", Icon: Crown, perm: "vip" },
  { href: "/admin/deals", label: "Deals", Icon: Handshake, perm: "vip" },
  { href: "/admin/levels", label: "Seller levels", Icon: Award, perm: "vip" },
  { href: "/admin/referrals", label: "Referrals", Icon: Link2, perm: "vip" },
  { href: "/admin/rewards", label: "VIP rewards", Icon: Gift, perm: "rewards" },
  { href: "/admin/cancellations", label: "Cancellations", Icon: Undo2, perm: "cancellations" },
  { href: "/admin/categories", label: "Categories", Icon: FolderTree, perm: "catalog" },
  { href: "/admin/locations", label: "Locations", Icon: MapPin, perm: "catalog" },
  { href: "/admin/businesses", label: "Businesses", Icon: Store, perm: "businesses" },
  { href: "/admin/giveaways", label: "Giveaways", Icon: PartyPopper, perm: "giveaways" },
  { href: "/admin/content", label: "Homepage, ads & terms", Icon: Newspaper, perm: "content" },
  { href: "/admin/settings", label: "Settings", Icon: Settings, perm: "settings" },
  { href: "/admin/audit", label: "Audit log", Icon: ScrollText, perm: "audit" },
  { href: "/admin/admins", label: "Admins & roles", Icon: KeyRound, perm: "admins" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, permissions } = await requireAdminPage();
  const [pendingPayments, openReports, soldRequests] = await Promise.all([
    hasPermission(permissions, "payments") ? prisma.payment.count({ where: { status: { in: ["PENDING", "NEEDS_REVIEW", "AI_CHECKING"] } } }) : 0,
    hasPermission(permissions, "reports") ? prisma.report.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } }) : 0,
    hasPermission(permissions, "vip") ? prisma.successfulDeal.count({ where: { proofStatus: "PENDING" } }) : 0,
  ]);
  const badge: Record<string, number> = { "/admin/payments": pendingPayments, "/admin/reports": openReports, "/admin/deals": soldRequests };
  return (
    <div className="grid gap-6 lg:grid-cols-[232px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="mb-3 rounded-xl bg-slate-950 px-4 py-3 text-white">
          <p className="eyebrow text-slate-500">OceanX Admin</p>
          <p className="mt-1 truncate text-sm font-medium">{user.name}</p>
          <p className="text-xs text-slate-400">{user.adminRole?.name}</p>
        </div>
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-0.5 lg:px-0" aria-label="Admin">
          {NAV.filter((n) => hasPermission(permissions, n.perm)).map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-surface hover:text-slate-900 hover:shadow-sm">
              <Icon className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
              <span className="flex-1">{label}</span>
              {badge[href] ? <span className="rounded-full bg-coral-500 px-1.5 text-[11px] font-semibold text-white">{badge[href]}</span> : null}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 space-y-5">{children}</div>
    </div>
  );
}
