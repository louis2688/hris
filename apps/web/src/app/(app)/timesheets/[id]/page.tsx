import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { canAccessEmployee } from "@/server/authz";
import { canDecideTimesheet, getTimesheet, listProjects } from "@/server/services/timesheets";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { TimesheetGrid } from "@/components/timesheet-grid";
import { fmtDate, fmtDateTime, fullName } from "@/lib/utils";
import { DecideTimesheet } from "./decide";

export const metadata: Metadata = { title: "Timesheet" };

export default async function TimesheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession();
  const t = await getTimesheet(id).catch(() => null);
  if (!t || !(await canAccessEmployee(user, t.employeeId))) notFound();
  const projects = await listProjects();
  const tone = { DRAFT: "slate", SUBMITTED: "amber", APPROVED: "green", REJECTED: "red" } as const;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={`Timesheet - ${fullName(t.employee)}`} description={`Week of ${fmtDate(t.weekStart)}${t.submittedAt ? ` · submitted ${fmtDateTime(t.submittedAt)}` : ""}`} actions={<Badge tone={tone[t.status]}>{t.status.toLowerCase()}</Badge>} />
      <div className="space-y-6">
        <Card>
          <TimesheetGrid
            id={t.id}
            weekStart={t.weekStart.toISOString().slice(0, 10)}
            entries={t.entries.map((e) => ({ projectId: e.projectId, activity: e.activity, date: e.date.toISOString().slice(0, 10), hours: Number(e.hours) }))}
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            readOnly
          />
        </Card>
        {t.decidedAt ? (
          <Card>
            <CardBody className="text-sm">
              {t.status.toLowerCase()} {t.decidedBy ? `by ${fullName(t.decidedBy)}` : ""} on {fmtDateTime(t.decidedAt)}
              {t.decisionNote ? <p className="mt-1 text-slate-600">{t.decisionNote}</p> : null}
            </CardBody>
          </Card>
        ) : null}
        {t.status === "SUBMITTED" && canDecideTimesheet(user, t) ? (
          <Card>
            <CardHeader title="Decision" />
            <CardBody>
              <DecideTimesheet id={t.id} />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
