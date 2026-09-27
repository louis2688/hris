import "server-only";
import { prisma, type Prisma } from "@hris/db";
import type { DepartmentInput, HolidayInput, JobTitleInput, LocationInput, SessionUser } from "@hris/shared";
import { audit } from "./audit";
import { AppError, conflict } from "./errors";

const isUnique = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

export const listDepartments = () =>
  prisma.department.findMany({
    orderBy: { name: "asc" },
    include: {
      head: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
      parent: { select: { id: true, name: true } },
      _count: { select: { employees: { where: { deletedAt: null } } } },
    },
  });

/** id + name only, for filter dropdowns (listDepartments also joins head, parent and counts). */
export const departmentOptions = () => prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

export async function saveDepartment(actor: SessionUser, d: DepartmentInput, id?: string) {
  if (id && d.parentId === id) throw new AppError("A department cannot be its own parent");
  const data = { name: d.name, code: d.code ?? null, headId: d.headId ?? null, parentId: d.parentId ?? null };
  try {
    const row = id ? await prisma.department.update({ where: { id }, data }) : await prisma.department.create({ data });
    await audit(actor.id, id ? "department.update" : "department.create", "Department", row.id, { after: row });
    return row;
  } catch (e) {
    if (isUnique(e)) throw conflict("A department with that name or code already exists");
    throw e;
  }
}

export async function deleteDepartment(actor: SessionUser, id: string) {
  const n = await prisma.employee.count({ where: { departmentId: id, deletedAt: null } });
  if (n > 0) throw new AppError(`Reassign ${n} employee(s) before deleting this department`);
  await prisma.department.delete({ where: { id } });
  await audit(actor.id, "department.delete", "Department", id);
}

export const listJobTitles = () =>
  prisma.jobTitle.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { employees: { where: { deletedAt: null } } } } } });

export async function saveJobTitle(actor: SessionUser, d: JobTitleInput, id?: string) {
  const data = { name: d.name, description: d.description ?? null };
  try {
    const row = id ? await prisma.jobTitle.update({ where: { id }, data }) : await prisma.jobTitle.create({ data });
    await audit(actor.id, id ? "jobtitle.update" : "jobtitle.create", "JobTitle", row.id, { after: row });
    return row;
  } catch (e) {
    if (isUnique(e)) throw conflict("A job title with that name already exists");
    throw e;
  }
}

export async function deleteJobTitle(actor: SessionUser, id: string) {
  const n = await prisma.employee.count({ where: { jobTitleId: id, deletedAt: null } });
  if (n > 0) throw new AppError(`Reassign ${n} employee(s) before deleting this job title`);
  await prisma.jobTitle.delete({ where: { id } });
  await audit(actor.id, "jobtitle.delete", "JobTitle", id);
}

export const listLocations = () =>
  prisma.location.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { employees: { where: { deletedAt: null } } } } } });

export async function saveLocation(actor: SessionUser, d: LocationInput, id?: string) {
  const data = { name: d.name, address: d.address ?? null, city: d.city ?? null, country: d.country ?? null, timezone: d.timezone ?? null, latitude: d.latitude ?? null, longitude: d.longitude ?? null, geofenceRadius: d.geofenceRadius ?? null };
  try {
    const row = id ? await prisma.location.update({ where: { id }, data }) : await prisma.location.create({ data });
    await audit(actor.id, id ? "location.update" : "location.create", "Location", row.id, { after: row });
    return row;
  } catch (e) {
    if (isUnique(e)) throw conflict("A location with that name already exists");
    throw e;
  }
}

export async function deleteLocation(actor: SessionUser, id: string) {
  const n = await prisma.employee.count({ where: { locationId: id, deletedAt: null } });
  if (n > 0) throw new AppError(`Reassign ${n} employee(s) before deleting this location`);
  await prisma.location.delete({ where: { id } });
  await audit(actor.id, "location.delete", "Location", id);
}

export const listHolidays = (year: number) =>
  prisma.holiday.findMany({
    where: { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    orderBy: { date: "asc" },
    include: { location: { select: { id: true, name: true } } },
  });

export async function saveHoliday(actor: SessionUser, d: HolidayInput, id?: string) {
  const data = { name: d.name, type: d.type, date: new Date(d.date), locationId: d.locationId ?? null };
  try {
    const row = id ? await prisma.holiday.update({ where: { id }, data }) : await prisma.holiday.create({ data });
    await audit(actor.id, id ? "holiday.update" : "holiday.create", "Holiday", row.id, { after: row });
    return row;
  } catch (e) {
    if (isUnique(e)) throw conflict("A holiday on that date already exists for this location");
    throw e;
  }
}

export async function deleteHoliday(actor: SessionUser, id: string) {
  await prisma.holiday.delete({ where: { id } });
  await audit(actor.id, "holiday.delete", "Holiday", id);
}

/** Holidays for an employee (global + their location), one query via the relation instead of employee -> holiday. */
export const employeeHolidayWhere = (employeeId: string | null): Prisma.HolidayWhereInput => ({
  OR: [{ locationId: null }, ...(employeeId ? [{ location: { employees: { some: { id: employeeId } } } }] : [])],
});

/** ISO dates of holidays applying to an employee (global + their location). */
export async function holidayDatesFor(employeeId: string | null, from: Date, to: Date): Promise<string[]> {
  const rows = await prisma.holiday.findMany({ where: { date: { gte: from, lte: to }, ...employeeHolidayWhere(employeeId) }, select: { date: true } });
  return rows.map((r) => r.date.toISOString().slice(0, 10));
}
