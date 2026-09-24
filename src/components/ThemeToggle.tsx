"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";

export const THEME_KEY = "mvm-theme";

/** Runs before first paint (inlined in <head>) so the page never flashes the wrong theme. */
export const themeInitScript = `(function(){try{var d=document.documentElement;if(location.pathname.indexOf('/admin')===0){d.dataset.theme='light';return}var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.dataset.theme=t}catch(e){}})()`;

function preferred(): "light" | "dark" {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#060a13" : "#ffffff");
}

/** Light/dark switch for customers. The admin area always stays light. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const path = usePathname();
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const t = path.startsWith("/admin") ? "light" : preferred();
    apply(t);
    setTheme(t);
  }, [path]);

  if (path.startsWith("/admin")) return null;

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    const html = document.documentElement;
    html.classList.add("theme-anim");
    apply(next);
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    setTimeout(() => html.classList.remove("theme-anim"), 300);
  };

  const dark = theme === "dark";
  return (
    <button type="button" onClick={toggle} className={`btn-ghost px-2.5 ${className}`} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
      {dark ? <Sun className="h-5 w-5" strokeWidth={1.75} /> : <Moon className="h-5 w-5" strokeWidth={1.75} />}
    </button>
  );
}
