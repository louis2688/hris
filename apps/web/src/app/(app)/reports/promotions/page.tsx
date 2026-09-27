import type { Metadata } from "next";
import { gate } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { departmentOptions } from "@/server/services/org";
import { REPORTS, searchToParams } from "@/server/services/reports";
import { DepartmentFilter, ReportFilter, ReportTable } from "@/components/report-table";
import { Input, Select } from "@/components/ui/input";

export const metadata: Metadata = { title: "Promotions & transfers" };

export default async function PromotionsReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const params = searchToParams(await searchParams);
  const [report, departments] = await Promise.all([REPORTS.promotions(user, params), isStaff(user) ? departmentOptions() : []]);
  const f = report.filters;
  return (
    <ReportTable slug="promotions" query={params.toString()} report={report}>
      <ReportFilter label="Type">
        <Select name="type" defaultValue={f.type}>
          <option value="">Promotions and transfers</option>
          <option value="PROMOTION">Promotions</option>
          <option value="TRANSFER">Transfers</option>
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
