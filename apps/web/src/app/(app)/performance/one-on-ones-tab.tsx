import "server-only";
import { manilaISODate, type SessionUser } from "@hris/shared";
import { listOneOnOnes, reportCadence, STALE_DAYS } from "@/server/services/one-on-ones";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { fmtDate, fullName, isoDate } from "@/lib/utils";
import { MeetingCard, ScheduleButton, type MeetingView } from "./one-on-one-ui";

export async function OneOnOnesTab({ user }: { user: SessionUser }) {
  if (!user.employeeId) return <Card><EmptyState title="No employee profile linked" /></Card>;
  const [meetings, reports] = await Promise.all([listOneOnOnes(user), reportCadence(user)]);
  const today = manilaISODate();
  const picks = reports.map((r) => ({ id: r.id, name: fullName(r) }));
  const views: MeetingView[] = meetings.map((m) => {
    const date = isoDate(m.date);
    const isManager = m.managerId === user.employeeId;
    return {
      id: m.id,
      employeeId: m.employeeId,
      date,
      withName: fullName(isManager ? m.employee : m.manager),
      agenda: m.agenda,
      notes: m.notes,
      actionItems: m.actionItems,
      isManager,
      when: date < today ? "past" : date === today ? "today" : "upcoming",
    };
  });
  const upcoming = views.filter((v) => v.when !== "past").reverse();
  const past = views.filter((v) => v.when === "past");

  return (
    <div className="space-y-6">
      {reports.length ? (
        <Card>
          <CardHeader title="Direct reports" description={`Aim for a 1:1 at least every ${STALE_DAYS} days.`} action={<ScheduleButton reports={picks} />} />
          <ul className="divide-y divide-slate-100">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar first={r.firstName} last={r.lastName} src={r.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{fullName(r)}</p>
                  <p className="text-xs text-slate-500">
                    Last {r.last ? fmtDate(r.last) : "never"} · next {r.next ? fmtDate(r.next) : "not scheduled"}
                  </p>
                </div>
                {r.stale ? <Badge tone="amber">No 1:1 in {STALE_DAYS}+ days</Badge> : null}
                <ScheduleButton reports={picks} employeeId={r.id} label="Schedule" variant="secondary" size="sm" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Upcoming</h2>
        {upcoming.length ? upcoming.map((m) => <MeetingCard key={m.id} m={m} reports={picks} />) : (
          <Card>
            <EmptyState title="Nothing scheduled" description={reports.length ? "Schedule a 1:1 with one of your reports." : "Your manager schedules 1:1s. You can add agenda items before each one."} />
          </Card>
        )}
      </section>
      {past.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Past</h2>
          {past.map((m) => (
            <MeetingCard key={m.id} m={m} reports={picks} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
