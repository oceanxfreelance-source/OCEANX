import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { fileUrl } from "@/lib/storage";
import { formatDate } from "@/lib/dates";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { joinGiveawayAction } from "@/app/actions/marketplace";
import { EmptyState } from "@/components/ListingCard";
import Link from "next/link";

export const metadata = { title: "Giveaways" };

export default async function GiveawaysPage() {
  const session = await getSession();
  const giveaways = await prisma.giveaway.findMany({
    where: { status: { in: ["ACTIVE", "ENDED", "DRAWN"] } },
    orderBy: [{ status: "asc" }, { endsAt: "desc" }],
    take: 30,
    include: { _count: { select: { participants: true } }, participants: session ? { where: { userId: session.userId } } : false },
  });
  const now = new Date();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Giveaways</h1>
      {giveaways.length === 0 && <EmptyState title="No giveaways right now">Check back soon!</EmptyState>}
      <div className="grid gap-4 sm:grid-cols-2">
        {giveaways.map((g) => {
          const joined = Array.isArray(g.participants) && g.participants.length > 0;
          const won = joined && g.participants[0].isWinner;
          const open = g.status === "ACTIVE" && g.startsAt <= now && g.endsAt > now;
          return (
            <div key={g.id} className="card overflow-hidden">
              {g.imageFileId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(g.imageFileId)!} alt="" className="h-40 w-full object-cover" />
              )}
              <div className="space-y-2 p-4">
                <h2 className="text-lg font-semibold">{g.title}</h2>
                <p className="text-sm font-semibold text-coral-600">Prize: {g.prize}</p>
                <p className="whitespace-pre-line text-sm text-slate-700">{g.description}</p>
                <p className="text-xs text-slate-500">
                  Ends {formatDate(g.endsAt)} · {g._count.participants} joined{g.vipOnly ? " · VIP only" : ""}
                  {g.minStars > 0 ? ` · ${g.minStars}+ Stars` : ""}
                </p>
                {won ? (
                  <p className="rounded-xl bg-emerald-50 p-2 text-center font-semibold text-emerald-800">You won!</p>
                ) : joined ? (
                  <p className="rounded-xl bg-ocean-50 p-2 text-center text-sm text-ocean-800">You&apos;re entered{g.status === "DRAWN" ? " — winners have been drawn" : ""}.</p>
                ) : open ? (
                  session ? (
                    <ActionForm action={joinGiveawayAction}>
                      <input type="hidden" name="giveawayId" value={g.id} />
                      <SubmitButton className="btn-accent w-full">Join giveaway</SubmitButton>
                    </ActionForm>
                  ) : (
                    <Link href="/login?next=/giveaways" className="btn-accent w-full">Log in to join</Link>
                  )
                ) : (
                  <p className="text-center text-sm text-slate-500">{g.status === "DRAWN" ? "Winners drawn" : "Closed"}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
