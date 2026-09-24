import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { getActiveLocations, getSiteSettings } from "@/lib/site";
import { businessAnalytics } from "@/lib/services/business";
import { activeSubscription } from "@/lib/services/fees";
import { fileUrl } from "@/lib/storage";
import { formatMVR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { ImageUploader } from "@/components/ImageUploader";
import { StatusBadge, VerifiedBadge } from "@/components/ui/badges";
import { BankDetails, PaymentForm } from "@/components/PaymentForm";
import { updateBusinessAction, subscribeAction, featureListingAction } from "@/app/actions/business";

export default async function ManageBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/account/business/${id}`);
  const biz = await prisma.business.findUnique({ where: { id } });
  if (!biz || biz.ownerId !== user.id) notFound();
  const [sub, pending, plans, analytics, atolls, settings] = await Promise.all([
    activeSubscription(id),
    prisma.businessSubscription.findFirst({ where: { businessId: id, status: "PENDING_PAYMENT" }, include: { plan: true, payment: true } }),
    prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    businessAnalytics(id),
    getActiveLocations(),
    getSiteSettings(),
  ]);
  const featuredCount = analytics.listings.length ? await prisma.listing.count({ where: { businessId: id, status: "PUBLISHED", featuredUntil: { gt: new Date() } } }) : 0;
  const islands = atolls.flatMap((a) => a.islands.map((i) => ({ id: i.id, label: `${i.name}, ${a.code}` })));
  const paymentOpen = pending?.payment && ["AI_CHECKING", "PENDING", "NEEDS_REVIEW"].includes(pending.payment.status);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{biz.name} {biz.verified && <VerifiedBadge />}</h1>
        <Link href={`/business/${biz.slug}`} className="btn-secondary btn-sm">View storefront</Link>
      </div>

      <section className="card p-4">
        <h2 className="font-bold">Subscription</h2>
        {sub ? (
          <p className="mt-1 text-sm">
            <StatusBadge status="ACTIVE" labels={{ ACTIVE: sub.plan.name }} /> until {formatDate(sub.endsAt)} · {sub.plan.freeListingsPerPeriod} fee-free listings · {sub.plan.featuredSlots} featured slots ({featuredCount} in use)
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-600">No active plan. Your business can still post listings at the normal posting fee.</p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {plans.map((p) => (
            <ActionForm key={p.id} action={subscribeAction} className="rounded-xl border border-slate-200 p-3">
              <input type="hidden" name="businessId" value={id} />
              <input type="hidden" name="planId" value={p.id} />
              <p className="font-semibold">{p.name} — {formatMVR(p.price)} / {p.durationDays} days</p>
              <ul className="text-xs text-slate-600">{p.features.map((f) => <li key={f}>• {f}</li>)}</ul>
              <SubmitButton className="btn-primary btn-sm">{sub ? "Renew / change" : "Choose plan"}</SubmitButton>
            </ActionForm>
          ))}
        </div>
        {pending && (
          <div id="pay" className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3">
            <p className="font-semibold">Pay for {pending.plan.name}</p>
            {paymentOpen ? (
              <p className="text-sm">Your payment is being reviewed. We&apos;ll activate the plan once verified.</p>
            ) : (
              <>
                <BankDetails payment={settings.payment} amount={pending.price} />
                <PaymentForm purpose="BUSINESS_SUBSCRIPTION" targetId={pending.id} />
              </>
            )}
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-bold">Analytics</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[["Live", analytics.totals.live], ["Sold", analytics.totals.sold], ["Views", analytics.totals.views], ["Saves", analytics.totals.saves], ["Chats", analytics.totals.chats]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{k}</p><p className="text-xl font-bold">{v}</p></div>
          ))}
        </div>
        {analytics.listings.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Listing</th><th>Status</th><th>Views</th><th>Saves</th><th>Chats</th><th></th></tr></thead>
              <tbody>
                {analytics.listings.map((l) => (
                  <tr key={l.id}>
                    <td className="max-w-48 truncate"><Link href={`/listing/${l.id}`}>{l.title}</Link></td>
                    <td><StatusBadge status={l.status} /></td>
                    <td>{l.viewCount}</td>
                    <td>{l._count.savedBy}</td>
                    <td>{l._count.conversations}</td>
                    <td>
                      {sub && sub.plan.featuredSlots > 0 && l.status === "PUBLISHED" && (
                        <ActionForm action={featureListingAction}>
                          <input type="hidden" name="businessId" value={id} />
                          <input type="hidden" name="listingId" value={l.id} />
                          <SubmitButton className="btn-ghost btn-sm">Feature</SubmitButton>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ActionForm action={updateBusinessAction} className="card p-4">
        <h2 className="font-bold">Business profile & branding</h2>
        <input type="hidden" name="businessId" value={id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Logo" name="logo"><ImageUploader name="logoFileId" max={1} purpose="business_logo" initial={biz.logoFileId ? [{ id: biz.logoFileId, url: fileUrl(biz.logoFileId)! }] : []} /></Field>
          <Field label="Banner" name="banner"><ImageUploader name="bannerFileId" max={1} purpose="business_banner" initial={biz.bannerFileId ? [{ id: biz.bannerFileId, url: fileUrl(biz.bannerFileId)! }] : []} /></Field>
        </div>
        <Field label="Business name" name="name"><input id="name" name="name" required defaultValue={biz.name} className="input" /></Field>
        <Field label="Description" name="description"><textarea id="description" name="description" rows={4} defaultValue={biz.description ?? ""} className="input" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone" name="phone"><input id="phone" name="phone" defaultValue={biz.phone?.replace("+960", "") ?? ""} className="input" /></Field>
          <Field label="Email" name="email"><input id="email" name="email" type="email" defaultValue={biz.email ?? ""} className="input" /></Field>
          <Field label="Website" name="website"><input id="website" name="website" type="url" defaultValue={biz.website ?? ""} className="input" /></Field>
          <Field label="Address" name="address"><input id="address" name="address" defaultValue={biz.address ?? ""} className="input" /></Field>
          <Field label="Island" name="islandId">
            <select id="islandId" name="islandId" defaultValue={biz.islandId ?? ""} className="input">
              <option value="">—</option>
              {islands.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </Field>
          <Field label="Brand colour" name="brandColor"><input id="brandColor" name="brandColor" type="color" defaultValue={biz.brandColor ?? "#0e7490"} className="input h-11 p-1" /></Field>
        </div>
        <SubmitButton>Save</SubmitButton>
      </ActionForm>
    </div>
  );
}
