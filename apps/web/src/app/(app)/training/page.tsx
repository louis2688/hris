import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, ChevronRight, FileText } from "lucide-react";
import { prisma } from "@hris/db";
import { requireSession } from "@/server/auth/session";
import { canAccessEmployee, isStaff } from "@/server/authz";
import { deleteProgramAction, saveProgramAction } from "@/server/actions/growth";
import { listEvents, listPrograms, trainingsFor, type MyTraining } from "@/server/services/training";
import { EntityManager } from "@/components/entity-manager";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fullName } from "@/lib/utils";
import { fmtRange } from "./fmt";
import { EventButton, TrainingFeedbackButton } from "./ui";

export const metadata: Metadata = { title: "Training" };

const STATUS_TONE = { SCHEDULED: "blue", COMPLETED: "green", CANCELLED: "slate" } as const;
const ATT_TONE = { INVITED: "blue", ATTENDED: "green", ABSENT: "red" } as const;
const band = "border-b border-slate-100 bg-bone/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600 sm:px-5";
const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

function TrainingList({ rows, self }: { rows: MyTraining[]; self: boolean }) {
  const now = new Date();
  const upcoming = rows.filter((r) => r.event.endsAt >= now && r.event.status !== "CANCELLED").reverse();
  const past = rows.filter((r) => !upcoming.includes(r));
  const item = (r: MyTraining) => (
    <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:px-5" data-training={r.event.title}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bone text-ink" aria-hidden>
        <Award className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{r.event.title}</p>
        <p className="text-xs text-slate-500">
          {r.event.program.name}
          {r.event.program.provider ? ` · ${r.event.program.provider}` : ""} · {fmtRange(r.event.startsAt, r.event.endsAt)}
          {r.event.location ? ` · ${r.event.location}` : ""}
        </p>
        {r.result || r.score != null || r.certificate ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            {r.result ? <span>Result: <span className="font-semibold text-ink">{cap(r.result)}</span></span> : null}
            {r.score != null ? <span>Score: <span className="font-semibold text-ink">{r.score}</span></span> : null}
            {r.certificate ? (
              <a href={`/api/v1/documents/${r.certificate.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                <FileText className="size-3.5" aria-hidden /> Certificate
              </a>
            ) : null}
          </p>
        ) : null}
        {r.feedbackRating != null ? <p className="mt-1 text-xs text-slate-500">{self ? "You rated it" : "Rated"} {r.feedbackRating}/5</p> : null}
      </div>
      {r.event.status === "CANCELLED" ? <Badge tone="slate">Cancelled</Badge> : <Badge tone={ATT_TONE[r.status]}>{cap(r.status)}</Badge>}
      {self && r.status === "ATTENDED" && r.feedbackRating == null ? <TrainingFeedbackButton id={r.id} title={r.event.title} /> : null}
    </li>
  );
  return (
    <>
      <h4 className={band}>Upcoming</h4>
      {upcoming.length ? <ul className="divide-y divide-slate-100">{upcoming.map(item)}</ul> : <p className="px-5 py-4 text-sm text-slate-500">No upcoming trainings.</p>}
      <h4 className={`${band} border-t`}>Past</h4>
      {past.length ? <ul className="divide-y divide-slate-100">{past.map(item)}</ul> : <p className="px-5 py-4 text-sm text-slate-500">No past trainings yet.</p>}
    </>
  );
}

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ employee?: string }> }) {
  const user = await requireSession();
  const staff = isStaff(user);
  const { employee } = await searchParams;

  if (employee && employee !== user.employeeId) {
    if (!(await canAccessEmployee(user, employee))) notFound();
    const [emp, rows] = await Promise.all([prisma.employee.findUnique({ where: { id: employee }, select: { firstName: true, lastName: true, preferredName: true } }), trainingsFor(user, employee)]);
    if (!emp) notFound();
    return (
      <>
        <p className="mb-3 text-sm">
          <Link href="/training" className="text-slate-500 hover:text-brand-700">Training</Link>
          <span className="mx-1.5 text-slate-300">/</span>
          <span className="text-slate-700">{fullName(emp)}</span>
        </p>
        <PageHeader title={`Training history - ${fullName(emp)}`} description={`${rows.length} training${rows.length === 1 ? "" : "s"}`} />
        <Card>{rows.length ? <TrainingList rows={rows} self={false} /> : <EmptyState title="No trainings yet" />}</Card>
      </>
    );
  }

  const [mine, events, programs, reports] = await Promise.all([
    user.employeeId ? trainingsFor(user, user.employeeId) : [],
    staff ? listEvents() : [],
    staff ? listPrograms() : [],
    !staff && user.employeeId ? prisma.employee.findMany({ where: { managerId: user.employeeId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, preferredName: true, avatarUrl: true }, orderBy: { lastName: "asc" } }) : [],
  ]);
  const activePrograms = programs.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }));

  return (
    <>
      <PageHeader title="Training" description={staff ? "Programs, sessions, attendance and certificates" : "Your trainings, results and certificates"} actions={staff ? <EventButton programs={activePrograms} /> : null} />
      <div className="space-y-6">
        {user.employeeId && (mine.length || !staff) ? (
          <Card>
            <CardHeader title="My trainings" description="Rate a training after you attend it." />
            {mine.length ? <TrainingList rows={mine} self /> : <EmptyState title="No trainings yet" description="You will get a notification when HR invites you." />}
          </Card>
        ) : null}

        {reports.length ? (
          <Card>
            <CardHeader title="My team" description="Training history of your direct reports" />
            <ul className="divide-y divide-slate-100">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/training?employee=${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas sm:px-5">
                    <Avatar first={r.firstName} last={r.lastName} src={r.avatarUrl} size="sm" />
                    <span className="flex-1 text-sm font-medium text-ink">{fullName(r)}</span>
                    <ChevronRight className="size-4 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {staff ? (
          <>
            <Card>
              <CardHeader title="Events" description="Newest first. Open one to invite people and record attendance." />
              {events.length ? (
                <Table className="min-w-[640px]">
                  <THead>
                    <tr>
                      <TH>Event</TH>
                      <TH>When</TH>
                      <TH className="text-right">Attendees</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {events.map((e) => (
                      <TR key={e.id}>
                        <TD>
                          <Link href={`/training/${e.id}`} className="font-medium text-ink hover:text-brand-700">
                            {e.title}
                          </Link>
                          <p className="text-xs text-slate-500">{e.program.name}</p>
                        </TD>
                        <TD className="whitespace-nowrap">{fmtRange(e.startsAt, e.endsAt)}</TD>
                        <TD className="text-right tabular-nums">
                          {e._count.attendees}
                          {e.capacity ? ` / ${e.capacity}` : ""}
                        </TD>
                        <TD>
                          <Badge tone={STATUS_TONE[e.status]}>{cap(e.status)}</Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState title="No events yet" />
              )}
            </Card>
            <EntityManager
              title="Programs"
              description="Courses or curricula; each can run as many events as you need."
              singular="program"
              columns={["Program", "Provider", "Events", "Active"]}
              rows={programs.map((p) => ({
                id: p.id,
                cells: [p.name, p.provider ?? "-", p._count.events, p.isActive ? "Yes" : "No"],
                values: { name: p.name, description: p.description, provider: p.provider, isActive: p.isActive },
                deletable: p._count.events === 0,
              }))}
              fields={[
                { name: "name", label: "Name", required: true },
                { name: "provider", label: "Provider", placeholder: "In-house, TESDA, vendor..." },
                { name: "description", label: "Description", type: "textarea", span: 2 },
                { name: "isActive", label: "Active", type: "checkbox" },
              ]}
              saveAction={saveProgramAction}
              deleteAction={deleteProgramAction}
            />
          </>
        ) : null}
      </div>
    </>
  );
}
