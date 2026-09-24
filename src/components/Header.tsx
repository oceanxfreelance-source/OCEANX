import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getSiteSettings } from "@/lib/site";
import { prisma } from "@/lib/db";
import { unreadMessageCount } from "@/lib/services/messaging";
import { fileUrl } from "@/lib/storage";
import { Logo } from "./Logo";
import { BottomNav } from "./BottomNav";
import { UserMenu } from "./UserMenu";

export async function Header() {
  const [session, settings] = await Promise.all([getSession(), getSiteSettings()]);
  const user = session?.user ?? null;
  const [unreadMsgs, unreadNotifs] = user
    ? await Promise.all([unreadMessageCount(user.id), prisma.notification.count({ where: { userId: user.id, readAt: null, type: { not: "message" } } })])
    : [0, 0];
  // Admin links are rendered only for admins whose session passed OTP; the admin area itself is also guarded server-side.
  const isAdmin = !!user?.adminRole && !!session?.mfaVerified;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Logo name={settings.general.marketplaceName} tagline={settings.general.tagline} logoUrl={fileUrl(settings.general.logoFileId)} />
          <form action="/search" className="ml-2 hidden flex-1 md:block" role="search">
            <input name="q" type="search" placeholder="Search phones, scooters, furniture…" className="input" aria-label="Search listings" />
          </form>
          <nav className="ml-auto flex items-center gap-1">
            <Link href="/sell" className="btn-accent hidden sm:inline-flex">
              + Sell
            </Link>
            {user ? (
              <>
                <Link href="/messages" className="btn-ghost relative hidden md:inline-flex" aria-label="Messages">
                  💬
                  {unreadMsgs > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white">{unreadMsgs}</span>}
                </Link>
                <Link href="/account/notifications" className="btn-ghost relative" aria-label="Notifications">
                  🔔
                  {unreadNotifs > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white">{unreadNotifs}</span>}
                </Link>
                <UserMenu name={user.name} isAdmin={isAdmin} />
              </>
            ) : (
              <>
                <Link href="/login" className="btn-ghost">
                  Log in
                </Link>
                <Link href="/register" className="btn-primary hidden sm:inline-flex">
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
        <form action="/search" className="px-4 pb-2.5 md:hidden" role="search">
          <input name="q" type="search" placeholder="Search MV Markets" className="input" aria-label="Search listings" />
        </form>
      </header>
      <BottomNav signedIn={!!user} unread={unreadMsgs} />
    </>
  );
}
