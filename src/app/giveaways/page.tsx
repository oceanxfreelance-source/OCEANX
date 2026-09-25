import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { fileUrl } from "@/lib/storage";
import { formatDateTime } from "@/lib/dates";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { joinGiveawayAction } from "@/app/actions/marketplace";
import { EmptyState } from "@/components/ListingCard";
import { GiveawayMachine, type LiveState } from "@/components/GiveawayMachine";
import { giveawayLiveState } from "@/lib/services/giveaways";

export const metadata = { title: "Giveaways" };
export const dynamic = "force-dynamic";

export default async function GiveawaysPage() {
  const session = await getSession();
  const now = new Date();
  const list = await prisma.giveaway.findMany({
    where: { status: { in: ["ACTIVE", "ENDED", "DRAWN"] } },
    orderBy: { endsAt: "desc" },
    take: 30,
  });
  // Live first, then upcoming, then finished.
  const rank = (g: (typeof list)[number]) => (g.status === "DRAWN" || g.endsAt <= now ? 2 : g.startsAt > now ? 1 : 0);
  list.sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.endsAt.getTime() - a.endsAt.getTime() : a.endsAt.getTime() - b.endsAt.getTime()));
  const states = await Promise.all(list.map((g) => giveawayLiveState(g.id, session?.userId ?? null)));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Giveaways</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">Join for free. When the countdown ends, the machine stops on the winner — picked at random by the system.</p>
      {list.length === 0 && <EmptyState title="No giveaways right now">Check back soon!</EmptyState>}
      <div className="grid gap-5 sm:grid-cols-2">
        {list.map((g, i) => {
          const s = states[i];
          if (!s) return null;
          const open = s.status !== "DRAWN" && g.startsAt <= now && g.endsAt > now;
          return (
            <div key={g.id} id={`g-${g.id}`} className="card scroll-mt-24 overflow-hidden">
              {g.imageFileId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(g.imageFileId)!} alt="" className="h-40 w-full object-cover" />
              )}
              <div className="space-y-3 p-4">
                <div>
                  <h2 className="text-lg font-semibold">{g.title}</h2>
                  <p className="text-sm font-semibold text-coral-600">Prize: {g.prize}</p>
                </div>
                <GiveawayMachine initial={s as LiveState} />
                {g.description && <p className="whitespace-pre-line text-sm text-slate-700">{g.description}</p>}
                <p className="text-xs text-slate-500">
                  {formatDateTime(g.startsAt)} → {formatDateTime(g.endsAt)} (Maldives time)
                  {g.vipOnly ? " · VIP only" : ""}
                  {g.minStars > 0 ? ` · ${g.minStars}+ Stars` : ""}
                  {g.winnersCount > 1 ? ` · ${g.winnersCount} winners` : ""}
                </p>
                {s.joined ? (
                  s.status !== "DRAWN" && <p className="rounded-xl bg-ocean-50 p-2 text-center text-sm font-medium text-ocean-800">You&apos;re in the draw — your name is on the machine. Good luck!</p>
                ) : open ? (
                  session ? (
                    <ActionForm action={joinGiveawayAction}>
                      <input type="hidden" name="giveawayId" value={g.id} />
                      <SubmitButton className="btn-accent w-full">Join giveaway</SubmitButton>
                    </ActionForm>
                  ) : (
                    <Link href="/login?next=/giveaways" className="btn-accent w-full">Log in to join</Link>
                  )
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
