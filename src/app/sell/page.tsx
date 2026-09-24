import { requireVerifiedUser } from "@/lib/auth/guards";
import { ListingForm } from "@/components/ListingForm";
import { saveListingAction } from "@/app/actions/sell";
import { sellFormData } from "./data";

export const metadata = { title: "Post a listing" };

export default async function SellPage() {
  const user = await requireVerifiedUser("/sell");
  const { settings: _settings, ...formData } = await sellFormData(user.id);
  void _settings;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Post a listing</h1>
        <p className="mt-1 text-sm text-slate-500">Four quick steps. You&apos;ll see a preview before anything goes live.</p>
      </div>
      <ListingForm action={saveListingAction} {...formData} defaults={{ contactPhone: user.phone, showPhone: user.profile?.showPhone ?? true, atollId: user.profile?.atollId, islandId: user.profile?.islandId }} />
    </div>
  );
}
