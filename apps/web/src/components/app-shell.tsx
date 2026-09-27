"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BarChart3,
  Bell,
  Briefcase,
  ClipboardList,
  Clock,
  Fingerprint,
  Target,
  Building2,
  CalendarDays,
  ChevronDown,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Palmtree,
  Settings,
  User,
  Users,
  UsersRound,
  X,
  CalendarClock,
  Inbox,
  Wallet,
  Megaphone,
  Network,
  Sparkles,
  Banknote,
  ListChecks,
  Laptop,
  GraduationCap,
  MessageSquareHeart,
  DoorOpen,
  HeartPulse,
  Scale,
} from "lucide-react";
import type { SessionUser } from "@hris/shared";
import { ROLE_LABELS } from "@hris/shared";
import { logoutAction } from "@/server/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; roles?: SessionUser["role"][]; group: "me" | "manage" };

const MANAGERS: SessionUser["role"][] = ["MANAGER", "HR", "ADMIN"];
const STAFF: SessionUser["role"][] = ["HR", "ADMIN"];

// Order matters: the first 5 visible items become the mobile bottom tabs.
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "me" },
  { href: "/attendance", label: "Attendance", icon: Clock, group: "me" },
  { href: "/me/leave", label: "My Leave", icon: Palmtree, group: "me" },
  { href: "/timesheets", label: "Timesheets", icon: ClipboardList, group: "me" },
  { href: "/me", label: "My Info", icon: User, group: "me" },
  { href: "/performance", label: "Performance", icon: Target, group: "me" },
  { href: "/schedule", label: "Schedule", icon: CalendarClock, group: "me" },
  { href: "/requests", label: "Requests", icon: Inbox, group: "me" },
  { href: "/payslips", label: "Payslips", icon: Wallet, group: "me" },
  { href: "/announcements", label: "Announcements", icon: Megaphone, group: "me" },
  { href: "/training", label: "Training", icon: GraduationCap, group: "me" },
  { href: "/surveys", label: "Surveys", icon: MessageSquareHeart, group: "me" },
  { href: "/org-chart", label: "Org chart", icon: Network, group: "me" },
  { href: "/assistant", label: "HR Assistant", icon: Sparkles, group: "me" },
  { href: "/team", label: "My Team", icon: UsersRound, roles: MANAGERS, group: "manage" },
  { href: "/attendance/team", label: "Team Attendance", icon: Fingerprint, roles: MANAGERS, group: "manage" },
  { href: "/leave", label: "Leave", icon: CalendarDays, roles: MANAGERS, group: "manage" },
  { href: "/employees", label: "Employees", icon: Users, roles: STAFF, group: "manage" },
  { href: "/recruitment", label: "Recruitment", icon: Briefcase, roles: STAFF, group: "manage" },
  { href: "/payroll", label: "Payroll", icon: Banknote, roles: STAFF, group: "manage" },
  { href: "/onboarding", label: "Onboarding", icon: ListChecks, roles: STAFF, group: "manage" },
  { href: "/assets", label: "Assets", icon: Laptop, roles: STAFF, group: "manage" },
  { href: "/benefits", label: "Benefits", icon: HeartPulse, roles: STAFF, group: "manage" },
  { href: "/separations", label: "Separations", icon: DoorOpen, roles: STAFF, group: "manage" },
  { href: "/cases", label: "Cases", icon: Scale, roles: STAFF, group: "manage" },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: MANAGERS, group: "manage" },
  { href: "/settings", label: "Settings", icon: Settings, roles: STAFF, group: "manage" },
];

function useNav(user: SessionUser) {
  return NAV.filter((n) => !n.roles || n.roles.includes(user.role));
}

/** Longest matching href wins, so /attendance/team does not also light up /attendance. */
function activeHref(pathname: string, items: NavItem[]) {
  return items
    .filter((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function AppShell({ user, unread, children }: { user: SessionUser; unread: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const nav = useNav(user);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);

  const current = activeHref(pathname, nav);
  const links = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pt-2 scrollbar-thin">
      {nav.map((n, i) => {
        const active = current === n.href;
        const header = n.group === "manage" && nav[i - 1]?.group === "me";
        return (
          <React.Fragment key={n.href}>
          {header ? <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Manage</p> : null}
          <Link
            href={n.href}
            className={cn(
              "group relative flex h-10 items-center gap-3 rounded-full px-3.5 text-sm font-medium transition-colors duration-150",
              active ? "bg-ink text-on-dark" : "text-slate-600 hover:bg-ink/5 hover:text-ink",
            )}
            aria-current={active ? "page" : undefined}
          >
            <n.icon className={cn("size-[18px] transition-colors", active ? "text-on-dark" : "text-slate-500 group-hover:text-ink")} />
            {n.label}
          </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-hairline bg-bone text-ink lg:flex print:hidden">
        <Brand />
        {links}
        <div className="border-t border-hairline p-3">
          <UserMenu user={user} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px] lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-bone text-ink shadow-float focus:outline-none lg:hidden">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <Dialog.Close className="rounded-full p-2 text-slate-500 hover:bg-ink/5 hover:text-ink" aria-label="Close menu">
                <X className="size-5" />
              </Dialog.Close>
            </div>
            {links}
            <div className="border-t border-hairline p-3">
              <UserMenu user={user} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="glass sticky top-0 z-30 print:hidden flex h-[60px] items-center gap-3 border-b border-hairline px-4 lg:px-6">
            <Dialog.Trigger className="-ml-2 flex size-10 items-center justify-center rounded-full text-ink hover:bg-ink/5 lg:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </Dialog.Trigger>
            <div className="flex items-center gap-2 lg:hidden">
              <span className="flex size-7 items-center justify-center rounded-lg bg-brand-600 text-white">
                <Building2 className="size-3.5" />
              </span>
              <span className="font-display text-lg font-bold tracking-[-0.02em]">HRIS</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <Link href="/dashboard#notifications" className="relative flex size-10 items-center justify-center rounded-full text-ink hover:bg-ink/5" aria-label={`${unread} unread notifications`}>
                <Bell className="size-5" />
                {unread > 0 ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500 ring-2 ring-canvas" /> : null}
              </Link>
              <div className="hidden items-center gap-2 lg:flex">
                <span className="text-sm font-medium text-ink">{user.name}</span>
                <span className="rounded-full bg-card px-2.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-hairline">{ROLE_LABELS[user.role]}</span>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 pb-28 sm:py-6 lg:px-8 lg:pb-8 print:p-0">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>

          {/* Mobile bottom tabs */}
          <nav className="glass fixed inset-x-0 bottom-0 z-30 print:hidden flex border-t border-hairline px-1 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary">
            {nav.slice(0, 5).map((n) => {
              const active = current === n.href;
              return (
                <Link key={n.href} href={n.href} className={cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "font-semibold text-ink" : "text-slate-500")} aria-current={active ? "page" : undefined}>
                  <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-ink text-on-dark")}>
                    <n.icon className="size-5" />
                  </span>
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </Dialog.Root>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex h-16 items-center gap-2.5 px-5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Building2 className="size-4" />
      </span>
      <span className="font-display text-xl font-bold tracking-[-0.02em] text-ink">HRIS</span>
    </Link>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex w-full items-center gap-3 rounded-full px-2 py-2 text-left transition-colors hover:bg-ink/5">
        <span className="flex size-9 items-center justify-center rounded-full bg-card text-xs font-semibold text-ink ring-1 ring-hairline">
          {user.name
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
          <span className="block truncate text-xs text-slate-500">{ROLE_LABELS[user.role]}</span>
        </span>
        <ChevronDown className="size-4 text-slate-400" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={8} align="start" className="z-50 w-56 rounded-2xl bg-card p-1.5 shadow-float">
          <div className="px-3 py-2">
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
          <DropdownMenu.Item asChild>
            <Link href="/me" className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm text-ink outline-none hover:bg-bone focus:bg-bone">
              <User className="size-4" /> My profile
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/me/password" className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm text-ink outline-none hover:bg-bone focus:bg-bone">
              <KeyRound className="size-4" /> Change password
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/me/security" className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm text-ink outline-none hover:bg-bone focus:bg-bone">
              <Fingerprint className="size-4" /> Fingerprint &amp; Face ID
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
          <DropdownMenu.Item asChild>
            <button
              type="button"
              onClick={() => logoutAction()}
              className="flex w-full cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm text-red-600 outline-none hover:bg-red-50 focus:bg-red-50"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
