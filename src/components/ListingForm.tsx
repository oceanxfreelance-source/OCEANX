"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, FileText, MapPin, Phone } from "lucide-react";
import clsx from "clsx";
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

const STEPS = [
  { key: "photos", title: "Photos", hint: "Clear photos sell faster. The first photo is the cover.", Icon: Camera, fields: ["imageIds"] },
  { key: "details", title: "Details", hint: "Tell buyers what you're selling.", Icon: FileText, fields: ["title", "categoryId", "subcategoryId", "price", "condition", "description"] },
  { key: "location", title: "Location", hint: "Where can buyers see or collect it?", Icon: MapPin, fields: ["atollId", "islandId", "locationId", "locationDetail"] },
  { key: "contact", title: "Contact", hint: "Buyers can always message you in the app.", Icon: Phone, fields: ["contactPhone", "contactWhatsapp", "contactEmail", "businessId"] },
];

export function ListingForm({ action, categories, atolls, businesses, conditions, maxImages, defaults = {} }: Props) {
  const [state, formAction] = useActionState(action, null);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const panels = useRef<(HTMLElement | null)[]>([]);
  const fe = state?.fieldErrors ?? {};
  const err = (k: string) => (fe[k] ? <p className="mt-1 text-xs text-red-600">{fe[k]}</p> : null);

  // If the server rejects a field, jump back to the step that contains it.
  useEffect(() => {
    const keys = Object.keys(state?.fieldErrors ?? {});
    if (!keys.length) return;
    const idx = STEPS.findIndex((s) => s.fields.some((f) => keys.some((k) => k === f || k.startsWith(`${f}.`))));
    if (idx >= 0) setStep(idx);
  }, [state]);

  function validateStep(i: number): boolean {
    setStepError(null);
    const panel = panels.current[i];
    if (!panel) return true;
    if (STEPS[i].key === "photos" && !panel.querySelector('input[name="imageIds"]')) {
      setStepError("Add at least one photo to continue.");
      return false;
    }
    const inputs = Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"));
    for (const el of inputs) {
      if (!el.checkValidity()) {
        el.reportValidity();
        return false;
      }
    }
    return true;
  }

  function next() {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const last = step === STEPS.length - 1;

  return (
    <form ref={formRef} action={formAction} className="scroll-mt-24 space-y-5" noValidate={false}>
      {defaults.id && <input type="hidden" name="listingId" value={defaults.id} />}

      {/* Progress */}
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => (i < step || validateStep(step) ? setStep(i) : null)}
              className="w-full text-left"
              aria-current={i === step ? "step" : undefined}
            >
              <span className={clsx("block h-1 rounded-full transition", i <= step ? "bg-ocean-600" : "bg-slate-200")} />
              <span className={clsx("mt-2 flex items-center gap-1.5 text-xs font-medium", i === step ? "text-slate-900" : "text-slate-400")}>
                <s.Icon className="hidden h-3.5 w-3.5 sm:block" /> {s.title}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <FormMessage state={state} />

      <div className="card p-5 sm:p-6">
        <div className="mb-5">
          <p className="eyebrow">Step {step + 1} of {STEPS.length}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{STEPS[step].title}</h2>
          <p className="text-sm text-slate-500">{STEPS[step].hint}</p>
        </div>

        <section ref={(el) => { panels.current[0] = el; }} className={clsx(step !== 0 && "hidden")}>
          <ImageUploader initial={defaults.images ?? []} max={maxImages} />
        </section>

        <section ref={(el) => { panels.current[1] = el; }} className={clsx("space-y-4", step !== 1 && "hidden")}>
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" required minLength={5} maxLength={100} defaultValue={defaults.title} className="input" placeholder="e.g. Honda Dio 2019, low mileage" />
            {err("title")}
          </div>
          <CategoryPicker categories={categories} defaultCategory={defaults.categoryId} defaultSub={defaults.subcategoryId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="price">Price (MVR)</label>
              <input id="price" name="price" required inputMode="decimal" pattern="[0-9.,\s]+" defaultValue={defaults.price} className="input" placeholder="0" />
              {err("price")}
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="negotiable" defaultChecked={defaults.negotiable} className="h-4 w-4 rounded accent-ocean-600" /> Price is negotiable
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
            <textarea id="description" name="description" required minLength={10} maxLength={5000} rows={6} defaultValue={defaults.description} className="input" placeholder="Condition, age, what's included, reason for selling…" />
            {err("description")}
          </div>
        </section>

        <section ref={(el) => { panels.current[2] = el; }} className={clsx("space-y-4", step !== 2 && "hidden")}>
          <LocationPicker atolls={atolls} defaults={defaults} />
          <div>
            <label className="label" htmlFor="locationDetail">Location details <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="locationDetail" name="locationDetail" maxLength={120} defaultValue={defaults.locationDetail ?? ""} className="input" placeholder="e.g. Near Hulhumalé ferry terminal" />
          </div>
        </section>

        <section ref={(el) => { panels.current[3] = el; }} className={clsx("space-y-4", step !== 3 && "hidden")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="contactPhone">Phone</label>
              <input id="contactPhone" name="contactPhone" type="tel" inputMode="tel" defaultValue={defaults.contactPhone?.replace("+960", "") ?? ""} className="input" placeholder="7xxxxxx" />
              {err("contactPhone")}
            </div>
            <div>
              <label className="label" htmlFor="contactWhatsapp">WhatsApp / Viber <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="contactWhatsapp" name="contactWhatsapp" type="tel" inputMode="tel" defaultValue={defaults.contactWhatsapp?.replace("+960", "") ?? ""} className="input" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="contactEmail">Email <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="contactEmail" name="contactEmail" type="email" defaultValue={defaults.contactEmail ?? ""} className="input" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="showPhone" defaultChecked={defaults.showPhone ?? true} className="h-4 w-4 rounded accent-ocean-600" /> Show my phone number on the listing
          </label>
          {businesses.length > 0 && (
            <div>
              <label className="label" htmlFor="businessId">Post as</label>
              <select id="businessId" name="businessId" defaultValue={defaults.businessId ?? ""} className="input">
                <option value="">Myself (individual seller)</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} (business)</option>
                ))}
              </select>
            </div>
          )}
        </section>

        {stepError && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{stepError}</p>}
      </div>

      <div className="flex gap-3">
        {step > 0 && (
          <button type="button" onClick={() => setStep((s) => s - 1)} className="btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
        {last ? (
          <SubmitButton className="btn-accent flex-1" pendingText="Saving…">Preview listing <ArrowRight className="h-4 w-4" /></SubmitButton>
        ) : (
          <button type="button" onClick={next} className="btn-accent flex-1">
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </form>
  );
}
