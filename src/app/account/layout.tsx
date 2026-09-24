import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { pendingTermsFor } from "@/lib/services/users";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const NAV = [
  ["/account", "Dashboard"],
  ["/account/listings", "My listings"],
  ["/messages", "Messages"],
  ["/account/saved", "Saved"],
  ["/account/purchases", "Purchases"],
  ["/account/payments", "Payments"],
  ["/account/vip", "Stars & VIP"],
  ["/account/cancellations", "Cancellations"],
  ["/account/business", "Business"],
  ["/account/referrals", "Referrals"],
  ["/account/notifications", "Notifications"],
  ["/account/settings", "Settings"],
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/account");
  if ((await pendingTermsFor(user.id)).length > 0) redirect("/accept-terms?next=/account");
  return (
    <div className="grid gap-4 md:grid-cols-[200px_1fr]">
      <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0" aria-label="Account">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white hover:shadow-sm">
            {label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0">
        {!user.emailVerifiedAt && (
          <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Please <Link href="/verify?next=/account" className="font-semibold underline">verify your email</Link> to start selling and messaging.
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
