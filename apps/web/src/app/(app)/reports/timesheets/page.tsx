import type { Metadata } from "next";
import { TIMESHEET_STATUSES } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { listDepartments } from "@/server/services/org";
import { listProjects } from "@/server/services/timesheets";
import { REPORTS, searchToParams } from "@/server/services/reports";
import { DepartmentFilter, ReportFilter, ReportTable } from "@/components/report-table";
import { Input, Select } from "@/components/ui/input";

export const metadata: Metadata = { title: "Timesheet report" };

export default async function TimesheetReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const params = searchToParams(await searchParams);
  const [report, departments, projects] = await Promise.all([REPORTS.timesheets(user, params), isStaff(user) ? listDepartments() : [], listProjects()]);
  const f = report.filters;
  return (
    <ReportTable slug="timesheets" query={params.toString()} report={report}>
      <ReportFilter label="From">
        <Input type="date" name="from" defaultValue={f.from} />
      </ReportFilter>
      <ReportFilter label="To">
        <Input type="date" name="to" defaultValue={f.to} />
      </ReportFilter>
      <ReportFilter label="Timesheet status">
        <Select name="status" defaultValue={f.status}>
          {TIMESHEET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
          <option value="ALL">All statuses</option>
        </Select>
      </ReportFilter>
      <ReportFilter label="Project">
        <Select name="projectId" defaultValue={f.projectId}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </ReportFilter>
      <DepartmentFilter departments={departments} value={f.departmentId} />
    </ReportTable>
  );
}
