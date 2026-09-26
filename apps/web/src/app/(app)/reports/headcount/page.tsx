import type { Metadata } from "next";
import { gate } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { listDepartments } from "@/server/services/org";
import { REPORTS, searchToParams } from "@/server/services/reports";
import { DepartmentFilter, ReportFilter, ReportTable } from "@/components/report-table";
import { Input, Select } from "@/components/ui/input";

export const metadata: Metadata = { title: "Headcount report" };

export default async function HeadcountReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const params = searchToParams(await searchParams);
  const [report, departments] = await Promise.all([REPORTS.headcount(user, params), isStaff(user) ? listDepartments() : []]);
  const f = report.filters;
  return (
    <ReportTable slug="headcount" query={params.toString()} report={report}>
      <ReportFilter label="Group by">
        <Select name="groupBy" defaultValue={f.groupBy}>
          <option value="department">Department</option>
          <option value="status">Employment status</option>
          <option value="type">Employment type</option>
        </Select>
      </ReportFilter>
      <ReportFilter label="From">
        <Input type="date" name="from" defaultValue={f.from} />
      </ReportFilter>
      <ReportFilter label="To">
        <Input type="date" name="to" defaultValue={f.to} />
      </ReportFilter>
      <DepartmentFilter departments={departments} value={f.departmentId} />
    </ReportTable>
  );
}
