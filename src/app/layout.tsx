import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getSiteSettings } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    title: { default: `${s.general.marketplaceName} ${s.general.tagline}`, template: `%s · ${s.general.marketplaceName}` },
    description: "Buy and sell across the Maldives. List items for a small one-time fee — no commission on your sale.",
    applicationName: s.general.marketplaceName,
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e7490",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Header />
        <main className="mx-auto min-h-[70vh] max-w-6xl px-4 pb-28 pt-4 md:pb-12">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
