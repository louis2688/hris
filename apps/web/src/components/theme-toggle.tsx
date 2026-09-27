"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export const THEME_COOKIE = "hris_theme";

/** Runs before hydration so the first paint already has the right theme (no flash). */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);var t=m?m[1]:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}})()`;

function apply(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  // ponytail: cookie so the server renders the right class on the next request; 1 year
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = React.useState<boolean | null>(null);
  React.useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  function toggle() {
    const next = dark ? "light" : "dark";
    apply(next);
    setDark(next === "dark");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={cn("flex size-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5", className)}
    >
      {/* Both icons rendered; CSS picks one so SSR and the first client paint match without a flash. */}
      <Sun className="size-5 dark:hidden" />
      <Moon className="hidden size-5 dark:block" />
    </button>
  );
}
