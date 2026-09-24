import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { IntroSplash } from "@/components/IntroSplash";
import { themeInitScript } from "@/components/ThemeToggle";
import { PwaSetup } from "@/components/pwa";
import { InstallPrompt } from "@/components/InstallPrompt";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import { fileUrl } from "@/lib/storage";
import { getSiteSettings } from "@/lib/site";
import { env } from "@/lib/env";

/** Accepts either the bare token or the whole <meta …content="…"> tag pasted from Search Console. */
function verificationToken(raw: string) {
  const m = raw.match(/content=["']([^"']+)["']/);
  return (m ? m[1] : raw).trim() || undefined;
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  const name = s.general.marketplaceName;
  const title = `${name} — Buy & sell in the Maldives`;
  return {
    metadataBase: new URL(env.appUrl),
    title: { default: title, template: `%s · ${name}` },
    description: s.general.seoDescription,
    applicationName: name,
    keywords: ["mvmarkets", "MV Markets", "Maldives marketplace", "buy and sell Maldives", "Malé classifieds", "Hulhumalé", "used phones Maldives", "cars for sale Maldives", "property Maldives", "MV Markets", "OceanX"],
    openGraph: { type: "website", siteName: name, title, description: s.general.seoDescription, locale: "en_MV" },
    twitter: { card: "summary_large_image", title, description: s.general.seoDescription },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
    verification: { google: verificationToken(s.general.googleSiteVerification) },
    formatDetection: { telephone: false },
    appleWebApp: { capable: true, title: "MV Markets", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e7490",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSiteSettings();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen antialiased">
        {s.homepage.introAnimation && (
          <IntroSplash name={s.general.marketplaceName} tagline={s.general.tagline} logoUrl={s.general.logoFileId ? fileUrl(s.general.logoFileId) : null} />
        )}
        <PwaSetup />
        <InstallPrompt />
        <NotificationPrompt />
        <Header />
        <main className="mx-auto min-h-[70vh] max-w-6xl px-4 pb-28 pt-4 md:pb-12">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
