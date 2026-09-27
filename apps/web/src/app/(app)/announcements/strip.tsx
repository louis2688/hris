import Link from "next/link";
import { ArrowRight, ListChecks, Megaphone } from "lucide-react";
import type { SessionUser } from "@hris/shared";
import { dashboardStrip } from "@/server/services/announcements";

/** Dashboard strip: top pinned / unacknowledged announcement + own open onboarding tasks. Renders nothing when there is neither. */
export async function AnnouncementStrip({ user }: { user: SessionUser }) {
  const { announcement: a, openTasks } = await dashboardStrip(user);
  if (!a && !openTasks) return null;
  const needsAck = a?.requiresAck && !a.acks.length;
  return (
    <div className="mb-6 space-y-2">
      {a ? (
        <Link href="/announcements" className="group flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-on-dark transition-colors hover:bg-slate-800 sm:px-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Megaphone className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-on-dark/70">{needsAck ? "Policy - please acknowledge" : "Announcement"}</span>
            <span className="block truncate text-sm font-medium">{a.title}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}
      {openTasks ? (
        <Link href="/onboarding" className="group flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-hairline transition-colors hover:bg-canvas sm:px-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bone">
            <ListChecks className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-sm">
            You have <strong className="font-semibold">{openTasks}</strong> open task{openTasks === 1 ? "" : "s"} on your checklist
          </span>
          <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}
