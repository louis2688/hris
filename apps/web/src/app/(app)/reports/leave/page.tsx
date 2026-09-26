import type { Metadata } from "next";
import { gate } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { listLeaveTypes } from "@/server/services/leave";
import { listDepartments } from "@/server/services/org";
import { REPORTS, searchToParams } from "@/server/services/reports";
import { DepartmentFilter, ReportFilter, ReportTable } from "@/components/report-table";
import { Input, Select } from "@/components/ui/input";

export const metadata: Metadata = { title: "Leave report" };

export default async function LeaveReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const params = searchToParams(await searchParams);
  const [report, departments, types] = await Promise.all([REPORTS.leave(user, params), isStaff(user) ? listDepartments() : [], listLeaveTypes(true)]);
  const f = report.filters;
  return (
    <ReportTable slug="leave" query={params.toString()} report={report}>
      <ReportFilter label="Year" className="sm:w-28">
        <Input type="number" name="year" min={2000} max={2100} defaultValue={f.year} />
      </ReportFilter>
      <ReportFilter label="Leave type">
        <Select name="leaveTypeId" defaultValue={f.leaveTypeId}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </ReportFilter>
      <DepartmentFilter departments={departments} value={f.departmentId} />
    </ReportTable>
  );
}
