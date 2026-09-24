import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { formatMVR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { EmptyState } from "@/components/ListingCard";
import { answerDealAction } from "@/app/actions/marketplace";

export const metadata = { title: "Purchases" };

export default async function PurchasesPage() {
  const user = await requireUser("/account/purchases");
  const deals = await prisma.successfulDeal.findMany({ where: { buyerId: user.id }, orderBy: { createdAt: "desc" }, include: { listing: { select: { id: true, title: true } }, seller: { select: { name: true } } } });
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Purchases</h1>
      <p className="mb-4 text-sm text-slate-600">When a seller marks an item as sold to you, please confirm it. Honest confirmations keep seller ratings trustworthy.</p>
      {deals.length === 0 && <EmptyState title="No purchases yet" />}
      <ul className="space-y-3">
        {deals.map((d) => (
          <li key={d.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/listing/${d.listing.id}`} className="font-semibold">{d.listing.title}</Link>
              <StatusBadge status={d.status} labels={{ PENDING_CONFIRMATION: "Please confirm" }} />
            </div>
            <p className="text-sm text-slate-600">{formatMVR(d.price)} · Seller: {d.seller.name} · {formatDate(d.createdAt)}</p>
            {d.status === "PENDING_CONFIRMATION" && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <ActionForm action={answerDealAction}>
                  <input type="hidden" name="dealId" value={d.id} />
                  <input type="hidden" name="answer" value="confirm" />
                  <SubmitButton className="btn-primary w-full">Yes, I bought this</SubmitButton>
                </ActionForm>
                <ActionForm action={answerDealAction}>
                  <input type="hidden" name="dealId" value={d.id} />
                  <input type="hidden" name="answer" value="dispute" />
                  <input name="reason" className="input" placeholder="What happened? (optional)" maxLength={500} />
                  <SubmitButton className="btn-secondary w-full">No, I didn&apos;t buy this</SubmitButton>
                </ActionForm>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
