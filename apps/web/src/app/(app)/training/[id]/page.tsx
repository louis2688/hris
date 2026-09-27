import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Coins, MapPin, Star, UserRound, Users } from "lucide-react";
import { prisma } from "@hris/db";
import { gate } from "@/server/auth/session";
import { deleteEventAction } from "@/server/actions/growth";
import { getEvent, listPrograms, pickableEmployees, toLocalInput } from "@/server/services/training";
import { ConfirmButton } from "@/components/action-form";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { fullName } from "@/lib/utils";
import { fmtRange, peso } from "../fmt";
import { EventButton } from "../ui";
import { AttendeeRow, InviteForm } from "./attendee-ui";

export const metadata: Metadata = { title: "Training event" };

const STATUS_TONE = { SCHEDULED: "blue", COMPLETED: "green", CANCELLED: "slate" } as const;

export default async function TrainingEventPage({ params }: { params: Promise<{ id: string }> }) {
  await gate("ADMIN", "HR");
  const { id } = await params;
  const e = await getEvent(id).catch(() => null);
  if (!e) notFound();
  const [programs, people, depts] = await Promise.all([listPrograms(), pickableEmployees(), prisma.department.findMany({ where: { employees: { some: { deletedAt: null } } }, select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  const invited = new Set(e.attendees.map((a) => a.employeeId));
  const attended = e.attendees.filter((a) => a.status === "ATTENDED").length;
  const seatsLeft = e.capacity != null ? Math.max(0, e.capacity - e.attendees.length) : null;
  const comments = e.attendees.filter((a) => a.feedback);

  return (
    <div className="mx-auto max-w-5xl">
      <p className="mb-3 text-sm">
        <Link href="/training" className="text-slate-500 hover:text-brand-700">
          Training
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-700">{e.program.name}</span>
      </p>
      <PageHeader
        title={e.title}
        description={fmtRange(e.startsAt, e.endsAt)}
        actions={
          <>
            <Badge tone={STATUS_TONE[e.status]}>{e.status[0] + e.status.slice(1).toLowerCase()}</Badge>
            <EventButton
              variant="secondary"
              programs={programs.map((p) => ({ id: p.id, name: p.name }))}
              event={{ id: e.id, programId: e.programId, title: e.title, startsAt: toLocalInput(e.startsAt), endsAt: toLocalInput(e.endsAt), location: e.location, trainer: e.trainer, cost: e.cost?.toString() ?? null, capacity: e.capacity, status: e.status }}
            />
            <ConfirmButton action={deleteEventAction.bind(null, e.id)} confirm="Delete this event and its attendance records?" variant="ghost">
              Delete
            </ConfirmButton>
          </>
        }
      />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Attendees" value={`${e.attendees.length}${e.capacity ? ` / ${e.capacity}` : ""}`} hint={e.capacity ? `${seatsLeft} seat(s) left` : "No capacity limit"} icon={<Users />} />
          <Stat label="Attended" value={attended} hint={`${e.attendees.filter((a) => a.status === "ABSENT").length} absent`} icon={<UserRound />} />
          <Stat label="Avg feedback" value={e.avgFeedback != null ? `${e.avgFeedback} / 5` : "-"} hint={`${e.feedbackCount} rating(s)`} icon={<Star />} />
          <Stat label="Total cost" value={e.totalCost != null ? peso(e.totalCost) : "-"} hint={e.cost != null ? `${peso(e.cost.toString())} each, absentees excluded` : "No cost set"} icon={<Coins />} />
        </div>

        <Card>
          <CardBody className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4 text-slate-400" aria-hidden /> {e.location ?? "No location"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-4 text-slate-400" aria-hidden /> {e.trainer ?? "No trainer set"}
              {e.program.provider ? ` · ${e.program.provider}` : ""}
            </span>
            {e.program.description ? <span className="basis-full text-slate-500">{e.program.description}</span> : null}
          </CardBody>
        </Card>

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader title="Attendees" description="Mark attendance, results and scores. Certificates go to the employee's documents." />
            <datalist id="training-results">
              <option value="PASSED" />
              <option value="FAILED" />
            </datalist>
            {e.attendees.length ? (
              <ul className="divide-y divide-slate-100">
                {e.attendees.map((a) => (
                  <AttendeeRow
                    key={a.id}
                    a={{ id: a.id, name: fullName(a.employee), dept: a.employee.department?.name ?? null, status: a.status, result: a.result, score: a.score, certificate: a.certificate }}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState title="Nobody invited yet" description="Pick people on the right." />
            )}
          </Card>
          <Card className="h-fit lg:col-span-2">
            <CardHeader title="Invite" description={seatsLeft === 0 ? "This event is full." : "Tap a department to add everyone in it."} />
            <CardBody>
              {e.status !== "SCHEDULED" ? (
                <p className="text-sm text-slate-500">Only scheduled events take invites.</p>
              ) : seatsLeft === 0 ? null : (
                <InviteForm
                  eventId={e.id}
                  seatsLeft={seatsLeft}
                  departments={depts}
                  people={people.filter((p) => !invited.has(p.id)).map((p) => ({ id: p.id, name: fullName(p), deptId: p.departmentId, dept: p.department?.name }))}
                />
              )}
            </CardBody>
          </Card>
        </div>

        {comments.length ? (
          <Card>
            <CardHeader title="Feedback comments" />
            <ul className="divide-y divide-slate-100">
              {comments.map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <p className="text-slate-700">{a.feedback}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {fullName(a.employee)} · {a.feedbackRating}/5
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
