import "server-only";
import { employeeOptions } from "@/server/services/employees";
import { listDepartments, listJobTitles, listLocations } from "@/server/services/org";
import type { EmployeeFormOptions } from "./employee-form";

export async function loadFormOptions(): Promise<EmployeeFormOptions> {
  const [departments, jobTitles, locations, managers] = await Promise.all([listDepartments(), listJobTitles(), listLocations(), employeeOptions()]);
  return {
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    jobTitles: jobTitles.map((d) => ({ id: d.id, name: d.name })),
    locations: locations.map((d) => ({ id: d.id, name: d.name })),
    managers: managers.map((m) => ({ id: m.id, name: `${m.preferredName ?? m.firstName} ${m.lastName} (${m.employeeCode})` })),
  };
}
