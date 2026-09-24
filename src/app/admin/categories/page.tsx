import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { fileUrl } from "@/lib/storage";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageTitle, Section } from "@/components/admin/ui";
import { saveCategoryAction, deleteCategoryAction, saveSubcategoryAction, deleteSubcategoryAction } from "@/app/actions/admin";

export default async function AdminCategoriesPage() {
  await requireAdminPage("catalog");
  const cats = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { subcategories: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }, _count: { select: { listings: true } } } });
  return (
    <>
      <PageTitle title="Categories" />
      <p className="text-sm text-slate-600">Order is controlled by the “order” number (lowest first). Disable categories that are in use instead of deleting them.</p>
      {cats.map((c) => (
        <Section key={c.id} title={`${c.icon ?? ""} ${c.name} · ${c._count.listings} listings${c.isActive ? "" : " · disabled"}`}>
          <ActionForm action={saveCategoryAction}>
            <input type="hidden" name="id" value={c.id} />
            <div className="grid gap-2 sm:grid-cols-6">
              <input name="name" defaultValue={c.name} required className="input sm:col-span-2" />
              <input name="slug" defaultValue={c.slug} className="input" placeholder="slug" />
              <input name="icon" defaultValue={c.icon ?? ""} className="input" placeholder="Emoji" />
              <input name="sortOrder" type="number" defaultValue={c.sortOrder} className="input" aria-label="Order" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={c.isActive} className="h-4 w-4" /> Active</label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.imageFileId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(c.imageFileId)!} alt="" className="h-10 w-10 rounded-lg object-cover" />
              )}
              <input name="image" type="file" accept="image/*" className="text-sm" aria-label="Category image" />
              {c.imageFileId && <label className="text-xs"><input type="checkbox" name="removeImage" /> remove image</label>}
              <SubmitButton className="btn-primary btn-sm">Save</SubmitButton>
            </div>
          </ActionForm>
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Subcategories</p>
            {c.subcategories.map((s) => (
              <div key={s.id} className="flex flex-wrap items-end gap-2">
                <ActionForm action={saveSubcategoryAction} className="flex-1">
                  <input type="hidden" name="id" value={s.id} />
                  <div className="grid gap-2 sm:grid-cols-5">
                    <input name="name" defaultValue={s.name} required className="input sm:col-span-2" />
                    <input name="slug" defaultValue={s.slug} className="input" />
                    <input name="sortOrder" type="number" defaultValue={s.sortOrder} className="input" aria-label="Order" />
                    <div className="flex items-center gap-2">
                      <label className="text-sm"><input type="checkbox" name="isActive" defaultChecked={s.isActive} className="h-4 w-4" /> Active</label>
                      <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
                    </div>
                  </div>
                </ActionForm>
                <ActionForm action={deleteSubcategoryAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <SubmitButton className="btn-ghost btn-sm text-red-600" confirm="Delete this subcategory?">✕</SubmitButton>
                </ActionForm>
              </div>
            ))}
            <ActionForm action={saveSubcategoryAction}>
              <input type="hidden" name="categoryId" value={c.id} />
              <input type="hidden" name="isActive" value="on" />
              <div className="flex gap-2">
                <input name="name" required className="input" placeholder="New subcategory" />
                <input name="sortOrder" type="number" defaultValue={c.subcategories.length} className="input w-24" aria-label="Order" />
                <SubmitButton className="btn-secondary btn-sm">Add</SubmitButton>
              </div>
            </ActionForm>
          </div>
          <ActionForm action={deleteCategoryAction} className="mt-2">
            <input type="hidden" name="id" value={c.id} />
            <SubmitButton className="btn-ghost btn-sm text-red-600" confirm="Delete this category and its subcategories?">Delete category</SubmitButton>
          </ActionForm>
        </Section>
      ))}
      <Section title="Add category">
        <ActionForm action={saveCategoryAction}>
          <div className="grid gap-2 sm:grid-cols-4">
            <input name="name" required className="input sm:col-span-2" placeholder="Name" />
            <input name="icon" className="input" placeholder="Emoji" />
            <input name="sortOrder" type="number" defaultValue={cats.length} className="input" aria-label="Order" />
          </div>
          <input type="hidden" name="isActive" value="on" />
          <input name="image" type="file" accept="image/*" className="text-sm" aria-label="Category image" />
          <SubmitButton className="btn-primary btn-sm">Add category</SubmitButton>
        </ActionForm>
      </Section>
    </>
  );
}
