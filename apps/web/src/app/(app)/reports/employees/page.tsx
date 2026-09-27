import type { Metadata } from "next";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_STATUS_LABELS } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { departmentOptions, listLocations } from "@/server/services/org";
import { employeeColumns, REPORTS, searchToParams } from "@/server/services/reports";
import { DepartmentFilter, ReportFilter, ReportTable } from "@/components/report-table";
import { Checkbox, Select } from "@/components/ui/input";

export const metadata: Metadata = { title: "Employee report" };

export default async function EmployeeReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await gate("MANAGER", "HR", "ADMIN");
  const params = searchToParams(await searchParams);
  const staff = isStaff(user);
  const [report, departments, locations, columns] = await Promise.all([REPORTS.employees(user, params), staff ? departmentOptions() : [], staff ? listLocations() : [], employeeColumns(staff)]);
  const f = report.filters;
  const picked = new Set(f.cols!.split(","));
  return (
    <ReportTable slug="employees" query={params.toString()} report={report}>
      <fieldset className="basis-full">
        <legend className="mb-2 text-sm font-medium text-slate-700">Columns</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-6">
          {columns.map((c) => (
            <Checkbox key={c.key} name="cols" value={c.key} label={c.label} defaultChecked={picked.has(c.key)} />
          ))}
        </div>
      </fieldset>
      <DepartmentFilter departments={departments} value={f.departmentId} />
      <ReportFilter label="Status">
        <Select name="status" defaultValue={f.status}>
          <option value="">All statuses</option>
          {EMPLOYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {EMPLOYMENT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </ReportFilter>
      {locations.length ? (
        <ReportFilter label="Location">
          <Select name="locationId" defaultValue={f.locationId}>
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </ReportFilter>
      ) : null}
    </ReportTable>
  );
}
