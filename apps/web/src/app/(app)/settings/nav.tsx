"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings/departments", label: "Departments" },
  { href: "/settings/job-titles", label: "Job titles" },
  { href: "/settings/locations", label: "Locations" },
  { href: "/settings/qualifications", label: "Qualifications" },
  { href: "/settings/leave-types", label: "Leave types" },
  { href: "/settings/entitlements", label: "Entitlements" },
  { href: "/settings/holidays", label: "Holidays" },
  { href: "/settings/attendance", label: "Attendance" },
  { href: "/settings/projects", label: "Projects" },
  { href: "/settings/kpis", label: "KPIs" },
  { href: "/settings/review-cycles", label: "Review cycles" },
];

export function SettingsNav() {
  const p = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0" aria-label="Settings">
      <ul className="flex gap-1 lg:flex-col">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className={cn("block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors", p.startsWith(i.href) ? "bg-white text-brand-700 shadow-card ring-1 ring-slate-900/[0.06]" : "text-slate-600 hover:bg-white/70")}>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
