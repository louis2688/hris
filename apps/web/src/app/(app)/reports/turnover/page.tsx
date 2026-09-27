import type { Metadata } from "next";
import { gate } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { departmentOptions } from "@/server/services/org";
import { REPORTS, searchToParams } from "@/server/services/reports";
import { DepartmentFilter, ReportFilter, ReportTable } from "@/components/report-table";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Turnover & tenure" };

export default async function TurnoverReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const params = searchToParams(await searchParams);
  const [report, departments] = await Promise.all([REPORTS.turnover(user, params), isStaff(user) ? departmentOptions() : []]);
  const f = report.filters;
  return (
    <ReportTable slug="turnover" query={params.toString()} report={report}>
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
