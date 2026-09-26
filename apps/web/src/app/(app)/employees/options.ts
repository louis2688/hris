import "server-only";
import { employeeOptions } from "@/server/services/employees";
import { listDepartments, listJobTitles, listLocations } from "@/server/services/org";
import { listNationalities } from "@/server/services/qualifications";
import { prisma } from "@hris/db";
import type { EmployeeFormOptions } from "./employee-form";

export async function loadFormOptions(): Promise<EmployeeFormOptions> {
  const [departments, jobTitles, locations, managers, nationalities, shifts] = await Promise.all([
    listDepartments(),
    listJobTitles(),
    listLocations(),
    employeeOptions(),
    listNationalities(),
    prisma.workShift.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    jobTitles: jobTitles.map((d) => ({ id: d.id, name: d.name })),
    locations: locations.map((d) => ({ id: d.id, name: d.name })),
    managers: managers.map((m) => ({ id: m.id, name: `${m.preferredName ?? m.firstName} ${m.lastName} (${m.employeeCode})` })),
    nationalities: nationalities.map((n) => n.name),
    shifts,
  };
}
