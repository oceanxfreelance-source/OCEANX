import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { getSettings } from "@/lib/settings";
import { fileUrl } from "@/lib/storage";
import { formatDate } from "@/lib/dates";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageTitle, Section } from "@/components/admin/ui";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { saveBannerAction, deleteBannerAction, publishTermsAction } from "@/app/actions/admin";

type B = { id: string; title: string; subtitle: string | null; linkUrl: string | null; background: string; sortOrder: number; isActive: boolean; imageFileId: string | null; startsAt: Date | null; endsAt: Date | null };
const d = (x: Date | null) => (x ? new Date(x.getTime() + 5 * 3600000).toISOString().slice(0, 10) : "");

function BannerForm({ b }: { b?: B }) {
  return (
    <ActionForm action={saveBannerAction}>
      <input type="hidden" name="id" value={b?.id ?? ""} />
      <div className="grid gap-2 sm:grid-cols-3">
        <input name="title" defaultValue={b?.title} required className="input sm:col-span-2" placeholder="Title" />
        <input name="linkUrl" defaultValue={b?.linkUrl ?? ""} className="input" placeholder="/sell" />
        <input name="subtitle" defaultValue={b?.subtitle ?? ""} className="input sm:col-span-3" placeholder="Subtitle" />
        <label className="text-xs">Background<input name="background" type="color" defaultValue={b?.background ?? "#0e7490"} className="input h-11 p-1" /></label>
        <label className="text-xs">Show from<input name="startsAt" type="date" defaultValue={d(b?.startsAt ?? null)} className="input" /></label>
        <label className="text-xs">Show until<input name="endsAt" type="date" defaultValue={d(b?.endsAt ?? null)} className="input" /></label>
        <label className="text-xs">Order<input name="sortOrder" type="number" defaultValue={b?.sortOrder ?? 0} className="input" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={b?.isActive ?? true} className="h-4 w-4" /> Active</label>
        <div className="flex items-center gap-2">
          {b?.imageFileId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(b.imageFileId)!} alt="" className="h-10 w-16 rounded object-cover" />
          )}
          <input name="image" type="file" accept="image/*" className="text-xs" aria-label="Banner image" />
          {b?.imageFileId && <label className="text-xs"><input type="checkbox" name="removeImage" /> remove</label>}
        </div>
      </div>
      <SubmitButton className="btn-primary btn-sm">{b ? "Save banner" : "Add banner"}</SubmitButton>
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
      <PageTitle title="Homepage, banners & policies" />
      <SettingsForm group="homepage" settings={settings} />
      <Section title="Banners">
        <div className="space-y-4">
          {banners.map((b) => (
            <div key={b.id} className="rounded-xl border border-slate-200 p-3">
              <BannerForm b={b} />
              <ActionForm action={deleteBannerAction}><input type="hidden" name="id" value={b.id} /><SubmitButton className="btn-ghost btn-sm text-red-600" confirm="Delete banner?">Delete</SubmitButton></ActionForm>
            </div>
          ))}
          <div className="rounded-xl border border-dashed border-line-strong p-3"><BannerForm /></div>
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
