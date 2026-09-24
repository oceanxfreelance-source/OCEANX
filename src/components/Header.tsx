import Link from "next/link";
import { Bell, MessageSquare, Plus, Search } from "lucide-react";
import { MobileHeaderSearch } from "./MobileHeaderSearch";
import { ThemeToggle } from "./ThemeToggle";
import { getSession } from "@/lib/auth/session";
import { getSiteSettings } from "@/lib/site";
import { prisma } from "@/lib/db";
import { unreadMessageCount } from "@/lib/services/messaging";
import { fileUrl } from "@/lib/storage";
import { Logo } from "./Logo";
import { BottomNav } from "./BottomNav";
import { UserMenu } from "./UserMenu";

function Count({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">{n > 99 ? "99+" : n}</span>;
}

export async function Header() {
  const [session, settings] = await Promise.all([getSession(), getSiteSettings()]);
  const user = session?.user ?? null;
  const [unreadMsgs, unreadNotifs] = user
    ? await Promise.all([unreadMessageCount(user.id), prisma.notification.count({ where: { userId: user.id, readAt: null, type: { not: "message" } } })])
    : [0, 0];
  // Admin links are rendered only for admins whose session is verified; the admin area itself is also guarded server-side.
  const isAdmin = !!user?.adminRole && !!session?.mfaVerified;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Logo name={settings.general.marketplaceName} tagline={settings.general.tagline} logoUrl={fileUrl(settings.general.logoFileId)} />
          <form action="/search" className="relative ml-4 hidden max-w-xl flex-1 md:block" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input name="q" type="search" placeholder="Search phones, vehicles, property…" className="input h-10 min-h-10 bg-slate-50 pl-9 shadow-none" aria-label="Search listings" />
          </form>
          <nav className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Link href="/search" className="btn-ghost hidden px-3 lg:inline-flex">Browse</Link>
            <Link href="/business" className="btn-ghost hidden px-3 lg:inline-flex">For business</Link>
            {user ? (
              <>
                <Link href="/messages" className="btn-ghost relative hidden px-2.5 md:inline-flex" aria-label="Messages">
                  <MessageSquare className="h-5 w-5" strokeWidth={1.75} />
                  <Count n={unreadMsgs} />
                </Link>
                <Link href="/account/notifications" className="btn-ghost relative px-2.5" aria-label="Notifications">
                  <Bell className="h-5 w-5" strokeWidth={1.75} />
                  <Count n={unreadNotifs} />
                </Link>
                <UserMenu name={user.name} isAdmin={isAdmin} />
              </>
            ) : (
              <>
                <Link href="/login" className="btn-ghost">Log in</Link>
                <Link href="/register" className="btn-secondary hidden sm:inline-flex">Sign up</Link>
              </>
            )}
            <Link href="/sell" className="btn-accent ml-1 hidden sm:inline-flex">
              <Plus className="h-4 w-4" strokeWidth={2.25} /> Post a listing
            </Link>
          </nav>
        </div>
        <MobileHeaderSearch />
      </header>
      <BottomNav signedIn={!!user} unread={unreadMsgs} />
    </>
  );
}
