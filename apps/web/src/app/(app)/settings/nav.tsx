"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS: { href: string; label: string; adminOnly?: boolean }[] = [
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
  { href: "/settings/payroll", label: "Payroll" },
  { href: "/settings/checklists", label: "Checklists" },
  { href: "/settings/email", label: "Email", adminOnly: true },
  { href: "/settings/integrations", label: "Integrations", adminOnly: true },
  { href: "/settings/audit", label: "Audit log" },
];

export function SettingsNav({ isAdmin }: { isAdmin: boolean }) {
  const p = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0" aria-label="Settings">
      <ul className="flex gap-1 lg:flex-col">
        {ITEMS.filter((i) => isAdmin || !i.adminOnly).map((i) => (
          <li key={i.href}>
            <Link href={i.href} className={cn("block whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors", p.startsWith(i.href) ? "bg-white text-ink ring-1 ring-inset ring-hairline" : "text-slate-600 hover:bg-ink/5 hover:text-ink")}>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
