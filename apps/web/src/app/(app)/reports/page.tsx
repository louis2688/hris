import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock, Columns3, FileClock, Timer, TrendingDown, Users } from "lucide-react";
import { gate } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { Card, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Reports" };

const REPORTS = [
  { href: "/reports/headcount", title: "Headcount", description: "By department, status or type, with new hires and separations.", icon: Users },
  { href: "/reports/leave", title: "Leave balances", description: "Entitled, used, pending and available days per leave type.", icon: CalendarDays },
  { href: "/reports/attendance", title: "Attendance summary", description: "Monthly DTR totals: presence, absences, late, undertime and OT.", icon: Clock },
  { href: "/reports/timesheets", title: "Timesheet hours", description: "Hours per employee per project for a date range.", icon: Timer },
  { href: "/reports/turnover", title: "Turnover & tenure", description: "Start and end headcount, hires, separations, turnover % and average tenure.", icon: TrendingDown },
  { href: "/reports/promotions", title: "Promotions & transfers", description: "Every promotion and transfer in a date range, applied or scheduled.", icon: ArrowUpRight },
  { href: "/reports/expiring-documents", title: "Expiring documents", description: "Contracts, IDs and certificates expired or expiring in the next 60 days.", icon: FileClock },
  { href: "/reports/employees", title: "Employee report builder", description: "Pick columns and filters, then save the URL as your report.", icon: Columns3 },
];

export default async function ReportsPage() {
  const user = await gate("MANAGER", "HR", "ADMIN");
  return (
    <>
      <PageHeader title="Reports" description={isStaff(user) ? "Company-wide reports with CSV and PDF export" : "Reports for you and your direct reports"} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus">
            <Card className="h-full p-5 transition-colors group-hover:ring-ink/40">
              <r.icon className="size-5 text-ink" />
              <p className="mt-3 font-semibold text-ink">{r.title}</p>
              <p className="mt-1 text-sm text-slate-500">{r.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
