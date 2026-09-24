"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action";
import { FormMessage, SubmitButton } from "./ui/form";
import { ImageUploader } from "./ImageUploader";
import { CategoryPicker, LocationPicker } from "./Pickers";

type Props = {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  categories: { id: string; name: string; icon: string | null; subcategories: { id: string; name: string }[] }[];
  atolls: { id: string; name: string; islands: { id: string; name: string; locations: { id: string; name: string }[] }[] }[];
  businesses: { id: string; name: string }[];
  conditions: { value: string; label: string }[];
  maxImages: number;
  defaults?: {
    id?: string;
    title?: string;
    description?: string;
    price?: string;
    negotiable?: boolean;
    condition?: string;
    categoryId?: string;
    subcategoryId?: string | null;
    atollId?: string | null;
    islandId?: string | null;
    locationId?: string | null;
    locationDetail?: string | null;
    contactPhone?: string | null;
    contactWhatsapp?: string | null;
    contactEmail?: string | null;
    showPhone?: boolean;
    businessId?: string | null;
    images?: { id: string; url: string }[];
  };
};

export function ListingForm({ action, categories, atolls, businesses, conditions, maxImages, defaults = {} }: Props) {
  const [state, formAction] = useActionState(action, null);
  const fe = state?.fieldErrors ?? {};
  const err = (k: string) => (fe[k] ? <p className="mt-1 text-xs text-red-600">{fe[k]}</p> : null);
  return (
    <form action={formAction} className="space-y-5">
      {defaults.id && <input type="hidden" name="listingId" value={defaults.id} />}
      <FormMessage state={state} />

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">1. Photos</h2>
        <ImageUploader initial={defaults.images ?? []} max={maxImages} />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">2. What are you selling?</h2>
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" name="title" required minLength={5} maxLength={100} defaultValue={defaults.title} className="input" placeholder="e.g. Honda Dio 2019, low mileage" />
          {err("title")}
        </div>
        <CategoryPicker categories={categories} defaultCategory={defaults.categoryId} defaultSub={defaults.subcategoryId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="price">Price (MVR)</label>
            <input id="price" name="price" required inputMode="decimal" defaultValue={defaults.price} className="input" placeholder="0" />
            {err("price")}
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="negotiable" defaultChecked={defaults.negotiable} className="h-5 w-5 accent-ocean-700" /> Price is negotiable
            </label>
          </div>
          <div>
            <label className="label" htmlFor="condition">Condition</label>
            <select id="condition" name="condition" required defaultValue={defaults.condition ?? ""} className="input">
              <option value="" disabled>Choose…</option>
              {conditions.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" required minLength={10} maxLength={5000} rows={6} defaultValue={defaults.description} className="input" placeholder="Describe the item, its condition, what's included…" />
          {err("description")}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">3. Where is it?</h2>
        <LocationPicker atolls={atolls} defaults={defaults} />
        <div>
          <label className="label" htmlFor="locationDetail">Location details (optional)</label>
          <input id="locationDetail" name="locationDetail" maxLength={120} defaultValue={defaults.locationDetail ?? ""} className="input" placeholder="e.g. Near Hulhumalé ferry terminal" />
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">4. How can buyers reach you?</h2>
        <p className="text-sm text-slate-600">Buyers can always message you in the app. Add a phone number if you&apos;d like calls.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="contactPhone">Phone</label>
            <input id="contactPhone" name="contactPhone" type="tel" inputMode="tel" defaultValue={defaults.contactPhone?.replace("+960", "") ?? ""} className="input" placeholder="7xxxxxx" />
            {err("contactPhone")}
          </div>
          <div>
            <label className="label" htmlFor="contactWhatsapp">WhatsApp / Viber</label>
            <input id="contactWhatsapp" name="contactWhatsapp" type="tel" inputMode="tel" defaultValue={defaults.contactWhatsapp?.replace("+960", "") ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="contactEmail">Email</label>
            <input id="contactEmail" name="contactEmail" type="email" defaultValue={defaults.contactEmail ?? ""} className="input" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showPhone" defaultChecked={defaults.showPhone ?? true} className="h-5 w-5 accent-ocean-700" /> Show my phone number on the listing
        </label>
        {businesses.length > 0 && (
          <div>
            <label className="label" htmlFor="businessId">Post as</label>
            <select id="businessId" name="businessId" defaultValue={defaults.businessId ?? ""} className="input">
              <option value="">Myself (individual seller)</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>🏪 {b.name}</option>
              ))}
            </select>
          </div>
        )}
      </section>

      <SubmitButton className="btn-primary w-full" pendingText="Saving…">Continue to preview →</SubmitButton>
    </form>
  );
}
