import "server-only";
import { prisma } from "@hris/db";

/** Everyone current, flat, in one query. The client builds the tree from managerId. */
export async function orgChartPeople() {
  const rows = await prisma.employee.findMany({
    where: { deletedAt: null, employmentStatus: { notIn: ["RESIGNED", "TERMINATED"] } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      avatarUrl: true,
      managerId: true,
      jobTitle: { select: { name: true } },
      department: { select: { id: true, name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    first: r.preferredName ?? r.firstName,
    last: r.lastName,
    avatarUrl: r.avatarUrl,
    managerId: r.managerId,
    title: r.jobTitle?.name ?? null,
    deptId: r.department?.id ?? null,
    dept: r.department?.name ?? null,
  }));
}
export type OrgPerson = Awaited<ReturnType<typeof orgChartPeople>>[number];
