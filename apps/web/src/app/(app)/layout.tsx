import { redirect } from "next/navigation";
import { prisma } from "@hris/db";
import { getSession } from "@/server/auth/session";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return (
    <AppShell user={user} unread={unread}>
      {children}
    </AppShell>
  );
}
