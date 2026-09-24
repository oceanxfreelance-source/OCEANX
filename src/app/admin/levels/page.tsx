import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageTitle, Section } from "@/components/admin/ui";
import { saveLevelAction, deleteLevelAction } from "@/app/actions/admin";

function LevelForm({ l }: { l?: { id: string; name: string; slug: string; badge: string; color: string; description: string | null; rewards: string | null; minStars: number; minDeals: number; sortOrder: number; isActive: boolean } }) {
  return (
    <ActionForm action={saveLevelAction}>
      <input type="hidden" name="id" value={l?.id ?? ""} />
      <div className="grid gap-2 sm:grid-cols-4">
        <input name="name" defaultValue={l?.name} required className="input" placeholder="Name" />
        <input name="badge" defaultValue={l?.badge ?? "*"} className="input" placeholder="Short badge" />
        <input name="color" type="color" defaultValue={l?.color ?? "#0e7490"} className="input h-11 p-1" aria-label="Colour" />
        <input name="sortOrder" type="number" defaultValue={l?.sortOrder ?? 0} className="input" placeholder="Order" />
        <label className="text-xs">Min Stars<input name="minStars" type="number" min={0} defaultValue={l?.minStars ?? 0} className="input" /></label>
        <label className="text-xs">Min deals<input name="minDeals" type="number" min={0} defaultValue={l?.minDeals ?? 0} className="input" /></label>
        <input name="description" defaultValue={l?.description ?? ""} className="input sm:col-span-2" placeholder="Description" />
        <input name="rewards" defaultValue={l?.rewards ?? ""} className="input sm:col-span-3" placeholder="Rewards / perks (shown to sellers)" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={l?.isActive ?? true} className="h-4 w-4" /> Active</label>
      </div>
      <SubmitButton className="btn-primary btn-sm">{l ? "Save" : "Add level"}</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminLevelsPage() {
  await requireAdminPage("vip");
  const levels = await prisma.sellerLevel.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { stats: true } } } });
  return (
    <>
      <PageTitle title="Seller levels" />
      <p className="text-sm text-slate-600">A seller gets the highest active level whose Star and deal requirements they meet. Levels are based on genuine completed deals, never on number of listings.</p>
      {levels.map((l) => (
        <Section key={l.id} title={`${l.badge} ${l.name} — ${l._count.stats} sellers`} actions={
          <ActionForm action={deleteLevelAction}><input type="hidden" name="id" value={l.id} /><SubmitButton className="btn-ghost btn-sm text-red-600" confirm="Delete this level?">Delete</SubmitButton></ActionForm>
        }>
          <LevelForm l={l} />
        </Section>
      ))}
      <Section title="New level"><LevelForm /></Section>
    </>
  );
}
