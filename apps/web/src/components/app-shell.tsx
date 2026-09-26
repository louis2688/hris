"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Bell,
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
} from "lucide-react";
import type { SessionUser } from "@hris/shared";
import { ROLE_LABELS } from "@hris/shared";
import { logoutAction } from "@/server/actions/auth";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; roles?: SessionUser["role"][] };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/me", label: "My Info", icon: User },
  { href: "/me/leave", label: "My Leave", icon: Palmtree },
  { href: "/team", label: "My Team", icon: UsersRound, roles: ["MANAGER", "HR", "ADMIN"] },
  { href: "/employees", label: "Employees", icon: Users, roles: ["HR", "ADMIN"] },
  { href: "/leave", label: "Leave", icon: CalendarDays, roles: ["MANAGER", "HR", "ADMIN"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["HR", "ADMIN"] },
];

function useNav(user: SessionUser) {
  return NAV.filter((n) => !n.roles || n.roles.includes(user.role));
}

function isActive(pathname: string, href: string) {
  if (href === "/me") return pathname === "/me" || pathname.startsWith("/me/") && !pathname.startsWith("/me/leave");
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ user, unread, children }: { user: SessionUser; unread: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const nav = useNav(user);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);

  const links = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {nav.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
            aria-current={active ? "page" : undefined}
          >
            <n.icon className={cn("size-[18px]", active ? "text-brand-600" : "text-slate-400")} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <Brand />
        {links}
        <div className="border-t border-slate-100 p-3">
          <UserMenu user={user} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl focus:outline-none lg:hidden">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <Dialog.Close className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close menu">
                <X className="size-5" />
              </Dialog.Close>
            </div>
            {links}
            <div className="border-t border-slate-100 p-3">
              <UserMenu user={user} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/70 lg:px-6">
            <Dialog.Trigger className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </Dialog.Trigger>
            <div className="lg:hidden">
              <span className="text-sm font-semibold">HRIS</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/dashboard#notifications" className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label={`${unread} unread notifications`}>
                <Bell className="size-5" />
                {unread > 0 ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500 ring-2 ring-white" /> : null}
              </Link>
              <div className="hidden lg:block">
                <span className="text-sm text-slate-600">{user.name}</span>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-8">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>

          {/* Mobile bottom tabs */}
          <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary">
            {nav.slice(0, 5).map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <Link key={n.href} href={n.href} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-brand-700" : "text-slate-500")}>
                  <n.icon className="size-5" />
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
    <Link href="/dashboard" className="flex h-14 items-center gap-2.5 px-5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Building2 className="size-4" />
      </span>
      <span className="text-base font-semibold tracking-tight">HRIS</span>
    </Link>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100">
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
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
        <DropdownMenu.Content sideOffset={6} align="start" className="z-50 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          <div className="px-3 py-2">
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
          <DropdownMenu.Item asChild>
            <Link href="/me" className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none hover:bg-slate-100 focus:bg-slate-100">
              <User className="size-4" /> My profile
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/me/password" className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none hover:bg-slate-100 focus:bg-slate-100">
              <KeyRound className="size-4" /> Change password
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
          <DropdownMenu.Item asChild>
            <button
              type="button"
              onClick={() => logoutAction()}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 outline-none hover:bg-red-50 focus:bg-red-50"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
