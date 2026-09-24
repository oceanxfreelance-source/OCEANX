import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatMVR } from "@/lib/money";
import { VerifiedBadge } from "@/components/ui/badges";
import { fileUrl } from "@/lib/storage";

export const metadata = { title: "Business accounts" };

export default async function BusinessInfoPage() {
  const now = new Date();
  const [plans, businesses] = await Promise.all([
    prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.business.findMany({ where: { status: "ACTIVE", subscriptions: { some: { status: "ACTIVE", endsAt: { gt: now } } } }, take: 24, orderBy: { verified: "desc" } }),
  ]);
  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-ocean-900 p-6 text-white">
        <h1 className="text-3xl font-extrabold">MV Markets for Business</h1>
        <p className="mt-2 max-w-2xl text-ocean-100">A storefront, your branding and room for large inventory. Optional — individual sellers never need a subscription.</p>
        <Link href="/account/business" className="btn-accent mt-4">Set up your business</Link>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {plans.map((p) => (
          <div key={p.id} className="card p-5">
            <h2 className="text-lg font-bold">{p.name}</h2>
            <p className="text-2xl font-extrabold text-ocean-800">{formatMVR(p.price)} <span className="text-sm font-medium text-slate-500">/ {p.durationDays} days</span></p>
            {p.description && <p className="mt-1 text-sm text-slate-600">{p.description}</p>}
            <ul className="mt-3 space-y-1 text-sm">
              {p.features.map((f) => (
                <li key={f}>✅ {f}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      {businesses.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Businesses on MV Markets</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {businesses.map((b) => (
              <Link key={b.id} href={`/business/${b.slug}`} className="card flex flex-col items-center gap-2 p-4 text-center">
                {b.logoFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(b.logoFileId)!} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <span className="text-3xl">🏪</span>
                )}
                <span className="text-sm font-semibold">{b.name}</span>
                {b.verified && <VerifiedBadge />}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
