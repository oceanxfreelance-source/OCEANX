import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageTitle, Section } from "@/components/admin/ui";
import { saveLocationAction, deleteLocationAction } from "@/app/actions/admin";

function Row({ level, item, parentId }: { level: "atoll" | "island" | "location"; item?: { id: string; name: string; sortOrder: number; isActive: boolean; code?: string }; parentId?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionForm action={saveLocationAction} className="flex-1">
        <input type="hidden" name="level" value={level} />
        <input type="hidden" name="id" value={item?.id ?? ""} />
        <input type="hidden" name="parentId" value={parentId ?? ""} />
        <div className="flex flex-wrap items-center gap-2">
          {level === "atoll" && <input name="code" defaultValue={item?.code} required className="input w-20" placeholder="Code" />}
          <input name="name" defaultValue={item?.name} required className="input min-w-40 flex-1" placeholder={`New ${level}`} />
          <input name="sortOrder" type="number" defaultValue={item?.sortOrder ?? 0} className="input w-20" aria-label="Order" />
          <label className="text-sm"><input type="checkbox" name="isActive" defaultChecked={item?.isActive ?? true} className="h-4 w-4" /> Active</label>
          <SubmitButton className="btn-secondary btn-sm">{item ? "Save" : "Add"}</SubmitButton>
        </div>
      </ActionForm>
      {item && (
        <ActionForm action={deleteLocationAction}>
          <input type="hidden" name="level" value={level} />
          <input type="hidden" name="id" value={item.id} />
          <SubmitButton className="btn-ghost btn-sm text-red-600" confirm={`Delete this ${level}?`}>Delete</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export default async function AdminLocationsPage({ searchParams }: { searchParams: Promise<{ atoll?: string }> }) {
  await requireAdminPage("catalog");
  const sp = await searchParams;
  const atolls = await prisma.atoll.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { islands: true } } } });
  const selected = sp.atoll ? await prisma.atoll.findUnique({ where: { id: sp.atoll }, include: { islands: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { locations: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } } } }) : null;
  return (
    <>
      <PageTitle title="Locations (Atoll → Island → Area)" />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Section title="Atolls">
          <div className="space-y-2">
            {atolls.map((a) => (
              <div key={a.id}>
                <Row level="atoll" item={a} />
                <a href={`/admin/locations?atoll=${a.id}`} className="text-xs text-ocean-700 underline">{a._count.islands} islands →</a>
              </div>
            ))}
            <Row level="atoll" />
          </div>
        </Section>
        {selected && (
          <Section title={`Islands in ${selected.name}`}>
            <div className="space-y-3">
              {selected.islands.map((i) => (
                <div key={i.id} className="rounded-xl border border-slate-100 p-2">
                  <Row level="island" item={i} parentId={selected.id} />
                  <div className="ml-4 mt-2 space-y-1 border-l-2 border-slate-100 pl-3">
                    {i.locations.map((l) => <Row key={l.id} level="location" item={l} parentId={i.id} />)}
                    <Row level="location" parentId={i.id} />
                  </div>
                </div>
              ))}
              <Row level="island" parentId={selected.id} />
            </div>
          </Section>
        )}
      </div>
    </>
  );
}
