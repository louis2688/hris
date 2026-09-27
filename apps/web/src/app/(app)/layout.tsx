import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { prisma } from "@hris/db";
import { getSession } from "@/server/auth/session";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  // The unread dot streams in, so the shell no longer waits on a second DB round trip.
  return (
    <AppShell
      user={user}
      bell={
        <Suspense fallback={<BellLink />}>
          <UnreadBell userId={user.id} />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}

async function UnreadBell({ userId }: { userId: string }) {
  return <BellLink unread={await prisma.notification.count({ where: { userId, readAt: null } })} />;
}

function BellLink({ unread }: { unread?: number }) {
  return (
    <Link
      href="/dashboard#notifications"
      prefetch={false}
      className="relative flex size-10 items-center justify-center rounded-full text-ink hover:bg-ink/5"
      aria-label={unread === undefined ? "Notifications" : `${unread} unread notifications`}
    >
      <Bell className="size-5" />
      {unread ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500 ring-2 ring-canvas" /> : null}
    </Link>
  );
}
