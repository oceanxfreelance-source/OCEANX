import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { getSettings } from "@/lib/settings";
import { fileUrl } from "@/lib/storage";
import { formatDate } from "@/lib/dates";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageTitle, Section } from "@/components/admin/ui";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { saveBannerAction, deleteBannerAction, publishTermsAction } from "@/app/actions/admin";

type B = { id: string; title: string; subtitle: string | null; linkUrl: string | null; label: string | null; ctaText: string | null; background: string; sortOrder: number; isActive: boolean; imageFileId: string | null; startsAt: Date | null; endsAt: Date | null };
const d = (x: Date | null) => (x ? new Date(x.getTime() + 5 * 3600000).toISOString().slice(0, 10) : "");

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "block sm:col-span-2" : "block"}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function AdPreview({ b }: { b: B }) {
  return (
    <div className="relative flex aspect-[3/1] w-full items-end overflow-hidden rounded-lg p-3 text-white" style={{ background: b.background }}>
      {b.imageFileId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(b.imageFileId)!} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      {b.label && <span className="absolute right-2 top-2 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">{b.label}</span>}
      <div className="relative">
        <p className="text-sm font-semibold leading-tight">{b.title}</p>
        {b.subtitle && <p className="text-xs text-white/85">{b.subtitle}</p>}
      </div>
    </div>
  );
}

function BannerForm({ b }: { b?: B }) {
  return (
    <ActionForm action={saveBannerAction}>
      <input type="hidden" name="id" value={b?.id ?? ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Heading" wide><input name="title" defaultValue={b?.title} required maxLength={100} className="input" placeholder="e.g. Bank of Maldives — 0% instalments" /></Field>
        <Field label="Text under the heading (optional)" wide><input name="subtitle" defaultValue={b?.subtitle ?? ""} maxLength={200} className="input" placeholder="e.g. On all phones and laptops this month" /></Field>
        <Field label="Link (optional)" hint="A page here (/sell) or the sponsor's website (https://sponsor.mv — opens in a new tab)."><input name="linkUrl" defaultValue={b?.linkUrl ?? ""} className="input" placeholder="https://" /></Field>
        <Field label="Button text (optional)" hint='Shown when there is a link. Default: "Visit" / "Learn more".'><input name="ctaText" defaultValue={b?.ctaText ?? ""} maxLength={30} className="input" placeholder="Shop now" /></Field>
        <Field label="Tag (optional)" hint='Small tag in the corner, e.g. "Sponsored" or "Partner".'><input name="label" defaultValue={b?.label ?? ""} maxLength={30} className="input" placeholder="Sponsored" /></Field>
        <Field label="Background colour" hint="Used when there is no picture."><input name="background" type="color" defaultValue={b?.background ?? "#1d5d8d"} className="input h-11 p-1" /></Field>
        <Field label="Picture (optional)" hint="Wide image works best, about 1600 × 540." wide>
          <div className="flex flex-wrap items-center gap-3">
            <input name="image" type="file" accept="image/*" className="text-sm" aria-label="Ad picture" />
            {b?.imageFileId && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="removeImage" className="h-4 w-4" /> Remove current picture</label>}
          </div>
        </Field>
        <Field label="Show from (optional)"><input name="startsAt" type="date" defaultValue={d(b?.startsAt ?? null)} className="input" /></Field>
        <Field label="Show until (optional)" hint="The ad hides itself after this date."><input name="endsAt" type="date" defaultValue={d(b?.endsAt ?? null)} className="input" /></Field>
        <Field label="Position" hint="Lower numbers show first."><input name="sortOrder" type="number" defaultValue={b?.sortOrder ?? 0} className="input" /></Field>
        <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="isActive" defaultChecked={b?.isActive ?? true} className="h-4 w-4" /> Show this ad</label>
      </div>
      <SubmitButton className="btn-primary btn-sm mt-3">{b ? "Save ad" : "Add ad"}</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminContentPage() {
  await requireAdminPage("content");
  const [settings, banners, docs] = await Promise.all([
    getSettings(),
    prisma.banner.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.termsDocument.findMany({ orderBy: [{ type: "asc" }, { version: "desc" }], include: { _count: { select: { acceptances: true } } } }),
  ]);
  const current = (t: "TERMS" | "PRIVACY") => docs.find((x) => x.type === t && x.isCurrent);
  return (
    <>
      <PageTitle title="Homepage, ads & policies" />
      <SettingsForm group="homepage" settings={settings} />
      <Section title={`Home page ads (${banners.filter((b) => b.isActive).length} showing)`}>
        <p className="mb-4 text-sm text-slate-500">These slide across the top of the home page, one after another, every {settings.homepage.adSlideSeconds} seconds (change the time in Homepage settings above). Add your sponsors or any promotion.</p>
        <div className="space-y-4">
          {banners.map((b) => (
            <details key={b.id} className="rounded-xl border border-slate-200 p-3">
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <div className="w-40 shrink-0 sm:w-56"><AdPreview b={b} /></div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{b.title}</p>
                  <p className="text-xs text-slate-500">
                    {b.isActive ? "Showing" : "Hidden"} · position {b.sortOrder}
                    {b.endsAt ? ` · until ${formatDate(b.endsAt)}` : ""}
                    {b.linkUrl ? ` · ${b.linkUrl}` : ""}
                  </p>
                  <p className="mt-1 text-xs font-medium text-ocean-700">Edit ▾</p>
                </div>
              </summary>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <BannerForm b={b} />
                <ActionForm action={deleteBannerAction} className="mt-2"><input type="hidden" name="id" value={b.id} /><SubmitButton className="btn-ghost btn-sm text-red-600" confirm={`Delete the ad "${b.title}"?`}>Delete ad</SubmitButton></ActionForm>
              </div>
            </details>
          ))}
          <div className="rounded-xl border border-dashed border-line-strong p-4">
            <p className="mb-3 font-medium">Add a new ad</p>
            <BannerForm />
          </div>
        </div>
      </Section>
      {(["TERMS", "PRIVACY"] as const).map((t) => {
        const cur = current(t);
        return (
          <Section key={t} title={t === "TERMS" ? "Terms of Use" : "Privacy Policy"}>
            <p className="mb-2 text-xs text-slate-500">
              {cur ? `Current: version ${cur.version}, published ${formatDate(cur.publishedAt)}, accepted by ${cur._count.acceptances} users.` : "Not published yet."} Publishing creates a new version that every user must accept. Supports # headings, ## subheadings, - bullet lists and **bold**.
            </p>
            <ActionForm action={publishTermsAction}>
              <input type="hidden" name="type" value={t} />
              <input name="title" defaultValue={cur?.title} className="input" placeholder="Title" />
              <textarea name="content" defaultValue={cur?.content} rows={14} className="input font-mono text-xs" />
              <SubmitButton className="btn-primary" confirm="Publish a new version? All users will be asked to accept it.">Publish new version</SubmitButton>
            </ActionForm>
            <ul className="mt-2 text-xs text-slate-500">
              {docs.filter((x) => x.type === t).map((x) => <li key={x.id}>v{x.version} · {formatDate(x.publishedAt)} · {x._count.acceptances} acceptances {x.isCurrent && "· current"}</li>)}
            </ul>
          </Section>
        );
      })}
    </>
  );
}
