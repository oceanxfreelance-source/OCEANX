import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageTitle, Section } from "@/components/admin/ui";
import { saveGiveawayAction, drawGiveawayAction, deleteGiveawayAction, contactWinnerAction } from "@/app/actions/admin";

type G = { id: string; title: string; description: string; prize: string; startsAt: Date; endsAt: Date; status: string; vipOnly: boolean; minStars: number; winnersCount: number };
const dt = (d?: Date) => (d ? new Date(d.getTime() + 5 * 3600000).toISOString().slice(0, 16) : "");

function GiveawayForm({ g }: { g?: G }) {
  return (
    <ActionForm action={saveGiveawayAction}>
      <input type="hidden" name="id" value={g?.id ?? ""} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="title" defaultValue={g?.title} required className="input" placeholder="Title" />
        <input name="prize" defaultValue={g?.prize} required className="input" placeholder="Prize" />
        <textarea name="description" defaultValue={g?.description} rows={3} className="input sm:col-span-2" placeholder="Description & rules" />
        <label className="text-xs">Start date &amp; time (Maldives) — the draw machine starts rolling<input name="startsAt" type="datetime-local" defaultValue={dt(g?.startsAt)} required className="input" /></label>
        <label className="text-xs">End date &amp; time (Maldives) — the machine stops on the winner<input name="endsAt" type="datetime-local" defaultValue={dt(g?.endsAt)} required className="input" /></label>
        <label className="text-xs">Winners<input name="winnersCount" type="number" min={1} defaultValue={g?.winnersCount ?? 1} className="input" /></label>
        <label className="text-xs">Min Stars<input name="minStars" type="number" min={0} defaultValue={g?.minStars ?? 0} className="input" /></label>
        <label className="text-xs">Status
          <select name="status" defaultValue={g?.status ?? "DRAFT"} className="input">
            <option value="DRAFT">DRAFT (hidden)</option>
            <option value="ACTIVE">ACTIVE (shown; runs between the times above)</option>
            {g?.status === "DRAWN" && <option>DRAWN</option>}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="vipOnly" defaultChecked={g?.vipOnly} className="h-4 w-4" /> VIP members only</label>
        <input name="image" type="file" accept="image/*" className="text-sm sm:col-span-2" aria-label="Image" />
      </div>
      <p className="text-xs text-slate-500">Winners are drawn automatically at the end time (secure random draw, recorded in the audit log) and notified.</p>
      <SubmitButton className="btn-primary btn-sm">{g ? "Save" : "Create giveaway"}</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminGiveawaysPage() {
  await requireAdminPage("giveaways");
  const list = await prisma.giveaway.findMany({ orderBy: { createdAt: "desc" }, include: { participants: { where: { isWinner: true }, include: { user: { select: { name: true, email: true, phone: true } } } }, _count: { select: { participants: true } } } });
  return (
    <>
      <PageTitle title="Giveaways" />
      <Section title="New giveaway"><GiveawayForm /></Section>
      {list.map((g) => (
        <div key={g.id} id={`g-${g.id}`} className="scroll-mt-24">
        <Section title={`${g.title} · ${g._count.participants} participants`} actions={<StatusBadge status={g.status === "DRAWN" ? "VERIFIED" : g.status} labels={{ VERIFIED: "Drawn" }} />}>
          <p className="mb-2 text-xs text-slate-500">{formatDateTime(g.startsAt)} → {formatDateTime(g.endsAt)}</p>
          {g.participants.length > 0 && (
            <div className="mb-3 space-y-3">
              {g.participants.map((p) => {
                const digits = p.user.phone?.replace(/\D/g, "") ?? "";
                const first = p.user.name.split(" ")[0];
                return (
                  <div key={p.userId} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="font-semibold">🏆 Winner: {p.user.name}</p>
                    <p className="text-sm text-slate-600">{p.user.email}{p.user.phone ? ` · ${p.user.phone}` : " · no phone number on file"}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {digits && <a href={`tel:+${digits}`} className="btn-secondary btn-sm">Call</a>}
                      {digits && <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">WhatsApp</a>}
                      <a href={`mailto:${p.user.email}`} className="btn-secondary btn-sm">Email</a>
                    </div>
                    <ActionForm action={contactWinnerAction} className="mt-3 space-y-2">
                      <input type="hidden" name="giveawayId" value={g.id} />
                      <input type="hidden" name="userId" value={p.userId} />
                      <textarea name="message" rows={3} className="input" defaultValue={`Congratulations ${first}! 🎉 You won ${g.prize} in our giveaway “${g.title}”. Please reply here so we can arrange your prize.`} />
                      <SubmitButton className="btn-accent btn-sm" pendingText="Opening chat…">Message in app</SubmitButton>
                      <p className="text-xs text-slate-500">Opens a chat that appears in the winner&apos;s help chat on the website and app, with a notification.</p>
                    </ActionForm>
                  </div>
                );
              })}
            </div>
          )}
          {g.status !== "DRAWN" && g.endsAt < new Date() && (
            <ActionForm action={drawGiveawayAction} className="mb-3">
              <input type="hidden" name="id" value={g.id} />
              <SubmitButton className="btn-accent btn-sm" confirm="Draw winners now? This cannot be undone.">Draw {g.winnersCount} winner(s)</SubmitButton>
            </ActionForm>
          )}
          <div className="flex flex-wrap items-start gap-3">
            <details className="min-w-0 flex-1"><summary className="cursor-pointer text-sm text-ocean-700">Edit</summary><GiveawayForm g={g} /></details>
            <ActionForm action={deleteGiveawayAction}>
              <input type="hidden" name="id" value={g.id} />
              <SubmitButton className="btn-danger btn-sm" confirm={`Delete "${g.title}"${g._count.participants ? ` and its ${g._count.participants} entries` : ""}? This cannot be undone.`}>Delete</SubmitButton>
            </ActionForm>
          </div>
        </Section>
        </div>
      ))}
    </>
  );
}
