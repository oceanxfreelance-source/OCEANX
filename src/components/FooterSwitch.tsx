"use client";

import { usePathname } from "next/navigation";

/** Full footer on the home page (and on larger screens); a slim one-line footer on phones elsewhere. */
export function FooterSwitch({ full, compact }: { full: React.ReactNode; compact: React.ReactNode }) {
  const home = usePathname() === "/";
  if (home) return <>{full}</>;
  return (
    <>
      <div className="hidden md:block">{full}</div>
      <div className="md:hidden">{compact}</div>
    </>
  );
}
