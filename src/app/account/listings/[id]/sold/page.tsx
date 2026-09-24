import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { buyerCandidates } from "@/lib/services/deals";
import { getSiteSettings } from "@/lib/site";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { markSoldAction } from "@/app/actions/sell";

export const metadata = { title: "Mark as sold" };

export default async function MarkSoldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireVerifiedUser(`/account/listings/${id}/sold`);
  const l = await prisma.listing.findUnique({ where: { id } });
  if (!l || l.sellerId !== user.id) notFound();
  if (l.status !== "PUBLISHED") redirect("/account/listings");
  const [buyers, settings] = await Promise.all([buyerCandidates(id, user.id), getSiteSettings()]);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Mark as sold</h1>
      <p className="text-slate-600">
        <strong>{l.title}</strong> will show a SOLD badge and be removed from search. Your listing history is kept. Marking an item as sold is always free.
      </p>
      <ActionForm action={markSoldAction} className="card p-4">
        <input type="hidden" name="listingId" value={l.id} />
        <fieldset className="space-y-2">
          <legend className="label">Who bought it?</legend>
          {buyers.map((b) => (
            <label key={b.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3">
              <input type="radio" name="buyerId" value={b.id} className="h-5 w-5 accent-ocean-700" /> {b.name} <span className="text-xs text-slate-500">(messaged you on MV Markets)</span>
            </label>
          ))}
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3">
            <input type="radio" name="buyerId" value="" defaultChecked={buyers.length === 0} className="h-5 w-5 accent-ocean-700" /> Someone else / sold outside MV Markets
          </label>
        </fieldset>
        <p className="text-xs text-slate-500">
          {settings.deals.countingMode === "confirmed_only"
            ? "To earn Stars, pick the buyer — they'll be asked to confirm the purchase. Sales without a confirmed buyer don't count toward Stars or VIP."
            : "Choosing the buyer lets them confirm the purchase, which strengthens your reputation."}
        </p>
        <SubmitButton className="btn-primary w-full">Confirm sale</SubmitButton>
      </ActionForm>
    </div>
  );
}
