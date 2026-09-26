import type { Metadata } from "next";
import { gate } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { listDepartments } from "@/server/services/org";
import { REPORTS, searchToParams } from "@/server/services/reports";
import { DepartmentFilter, ReportFilter, ReportTable } from "@/components/report-table";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Attendance report" };

export default async function AttendanceReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const params = searchToParams(await searchParams);
  const [report, departments] = await Promise.all([REPORTS.attendance(user, params), isStaff(user) ? listDepartments() : []]);
  const f = report.filters;
  return (
    <ReportTable slug="attendance" query={params.toString()} report={report}>
      <ReportFilter label="Month">
        <Input type="month" name="month" defaultValue={f.month} />
      </ReportFilter>
      <DepartmentFilter departments={departments} value={f.departmentId} />
    </ReportTable>
  );
}
