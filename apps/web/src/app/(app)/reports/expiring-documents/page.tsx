import type { Metadata } from "next";
import { gate } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { departmentOptions } from "@/server/services/org";
import { REPORTS, searchToParams } from "@/server/services/reports";
import { DepartmentFilter, ReportFilter, ReportTable } from "@/components/report-table";
import { Select } from "@/components/ui/input";

export const metadata: Metadata = { title: "Expiring documents" };

export default async function ExpiringDocumentsReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const params = searchToParams(await searchParams);
  const [report, departments] = await Promise.all([REPORTS["expiring-documents"](user, params), isStaff(user) ? departmentOptions() : []]);
  const f = report.filters;
  return (
    <ReportTable slug="expiring-documents" query={params.toString()} report={report}>
      <ReportFilter label="Window">
        <Select name="days" defaultValue={f.days}>
          {[30, 60, 90, 180].map((d) => (
            <option key={d} value={d}>
              Next {d} days
            </option>
          ))}
        </Select>
      </ReportFilter>
      <DepartmentFilter departments={departments} value={f.departmentId} />
    </ReportTable>
  );
}
