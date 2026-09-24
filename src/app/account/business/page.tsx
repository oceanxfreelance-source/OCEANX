import { Store } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { getSiteSettings } from "@/lib/site";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { VerifiedBadge, StatusBadge } from "@/components/ui/badges";
import { createBusinessAction } from "@/app/actions/business";

export const metadata = { title: "Business accounts" };

export default async function MyBusinessesPage() {
  const user = await requireUser("/account/business");
  const settings = await getSiteSettings();
  const businesses = await prisma.business.findMany({ where: { ownerId: user.id }, include: { subscriptions: { where: { status: "ACTIVE", endsAt: { gt: new Date() } }, include: { plan: true }, take: 1 } } });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Business accounts</h1>
      <p className="text-sm text-slate-600">
        Optional for shops and larger sellers: storefront, branding, fee-free listings and analytics. Individual sellers never need one. <Link href="/business" className="underline">See plans</Link>
      </p>
      {businesses.map((b) => (
        <Link key={b.id} href={`/account/business/${b.id}`} className="card flex items-center justify-between p-4">
          <span className="flex items-center gap-2 font-semibold"><Store className="h-4 w-4 text-slate-500" /> {b.name} {b.verified && <VerifiedBadge />}</span>
          {b.subscriptions[0] ? <StatusBadge status="ACTIVE" labels={{ ACTIVE: b.subscriptions[0].plan.name }} /> : <StatusBadge status="NONE" labels={{ NONE: "No plan" }} />}
        </Link>
      ))}
      {settings.business.enabled && user.emailVerifiedAt ? (
        <ActionForm action={createBusinessAction} className="card p-4">
          <h2 className="font-semibold">Create a business</h2>
          <Field label="Business name" name="name"><input id="name" name="name" required minLength={2} maxLength={80} className="input" /></Field>
          <Field label="Description" name="description"><textarea id="description" name="description" rows={3} maxLength={2000} className="input" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone" name="phone"><input id="phone" name="phone" type="tel" className="input" /></Field>
            <Field label="Email" name="email"><input id="email" name="email" type="email" className="input" /></Field>
          </div>
          <SubmitButton>Create business</SubmitButton>
        </ActionForm>
      ) : (
        !settings.business.enabled && <p className="text-sm text-slate-500">Business accounts are currently unavailable.</p>
      )}
    </div>
  );
}
