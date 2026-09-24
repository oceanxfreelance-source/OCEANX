import Link from "next/link";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { ListingForm } from "@/components/ListingForm";
import { saveListingAction } from "@/app/actions/sell";
import { quotePostingFee } from "@/lib/services/fees";
import { formatMVR } from "@/lib/money";
import { sellFormData } from "./data";

export const metadata = { title: "Sell an item" };

export default async function SellPage() {
  const user = await requireVerifiedUser("/sell");
  const [data, quote] = await Promise.all([sellFormData(user.id), quotePostingFee(user.id)]);
  const { settings, ...formData } = data;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Sell an item</h1>
      <div className="my-4 rounded-2xl bg-ocean-50 p-4 text-sm text-ocean-900 ring-1 ring-ocean-100">
        {quote.isVipRate ? (
          <p>
            ★ <strong>{settings.vip.badgeName} posting fee: {formatMVR(quote.amount)}</strong> <span className="line-through opacity-60">{formatMVR(quote.normalFee)}</span> — {quote.discountPercent}% off as a {settings.vip.badgeName} seller.
          </p>
        ) : (
          <p>
            <strong>Posting fee: {formatMVR(quote.normalFee)}</strong> per listing, paid once after preview. No commission on your sale.{" "}
            <Link href="/vip" className="underline">{settings.vip.badgeName} sellers pay {formatMVR(quote.vipFee)}</Link>.
          </p>
        )}
      </div>
      <ListingForm action={saveListingAction} {...formData} defaults={{ contactPhone: user.phone, showPhone: user.profile?.showPhone ?? true, atollId: user.profile?.atollId, islandId: user.profile?.islandId }} />
    </div>
  );
}
