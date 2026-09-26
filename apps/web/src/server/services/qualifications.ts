import "server-only";
import { prisma } from "@hris/db";
import type { EmployeeQualificationInput, QualificationInput, QualificationKind, SessionUser } from "@hris/shared";
import { audit } from "./audit";
import { conflict } from "./errors";

const dupe = (e: unknown) => (e as { code?: string }).code === "P2002";

export const listQualifications = (kind?: QualificationKind) =>
  prisma.qualification.findMany({ where: kind ? { kind } : undefined, orderBy: [{ kind: "asc" }, { name: "asc" }], include: { _count: { select: { holders: true } } } });

export async function saveQualification(actor: SessionUser, d: QualificationInput, id?: string) {
  const data = { kind: d.kind, name: d.name, description: d.description ?? null };
  try {
    const row = id ? await prisma.qualification.update({ where: { id }, data }) : await prisma.qualification.create({ data });
    await audit(actor.id, id ? "qualification.update" : "qualification.create", "Qualification", row.id, { after: row });
    return row;
  } catch (e) {
    if (dupe(e)) throw conflict(`That ${d.kind.toLowerCase()} already exists`);
    throw e;
  }
}

export async function deleteQualification(actor: SessionUser, id: string) {
  await prisma.qualification.delete({ where: { id } });
  await audit(actor.id, "qualification.delete", "Qualification", id);
}

export const listNationalities = () => prisma.nationality.findMany({ orderBy: { name: "asc" } });

export async function saveNationality(actor: SessionUser, name: string, id?: string) {
  try {
    const row = id ? await prisma.nationality.update({ where: { id }, data: { name } }) : await prisma.nationality.create({ data: { name } });
    await audit(actor.id, "nationality.save", "Nationality", row.id, { after: row });
    return row;
  } catch (e) {
    if (dupe(e)) throw conflict("That nationality already exists");
    throw e;
  }
}

export async function deleteNationality(actor: SessionUser, id: string) {
  await prisma.nationality.delete({ where: { id } });
  await audit(actor.id, "nationality.delete", "Nationality", id);
}

export const employeeQualifications = (employeeId: string) =>
  prisma.employeeQualification.findMany({
    where: { employeeId },
    include: { qualification: true },
    orderBy: [{ qualification: { kind: "asc" } }, { qualification: { name: "asc" } }],
  });

export type EmployeeQualificationRow = Awaited<ReturnType<typeof employeeQualifications>>[number];

export async function saveEmployeeQualification(actor: SessionUser, employeeId: string, d: EmployeeQualificationInput) {
  const data = {
    qualificationId: d.qualificationId,
    level: d.level ?? null,
    number: d.number ?? null,
    issuedDate: d.issuedDate ? new Date(d.issuedDate) : null,
    expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
    amount: d.amount ?? null,
    notes: d.notes ?? null,
  };
  const row = d.id
    ? await prisma.employeeQualification.update({ where: { id: d.id, employeeId }, data })
    : await prisma.employeeQualification.create({ data: { ...data, employeeId } });
  await audit(actor.id, "employee.qualification", "Employee", employeeId, { after: row });
  return row;
}

export async function deleteEmployeeQualification(actor: SessionUser, employeeId: string, id: string) {
  await prisma.employeeQualification.delete({ where: { id, employeeId } });
  await audit(actor.id, "employee.qualification_delete", "Employee", employeeId, { before: { id } });
}
