import "server-only";
import { prisma, type Prisma } from "@hris/db";
import type { AssetInput, AssetListQuery, SessionUser } from "@hris/shared";
import { audit } from "./audit";
import { AppError, conflict, notFound } from "./errors";

const assignee = { select: { id: true, firstName: true, lastName: true, preferredName: true, employeeCode: true, avatarUrl: true } };

export function listAssets(q: AssetListQuery) {
  const where: Prisma.AssetWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.q
      ? {
          OR: [
            { tag: { contains: q.q, mode: "insensitive" } },
            { name: { contains: q.q, mode: "insensitive" } },
            { serialNumber: { contains: q.q, mode: "insensitive" } },
            { assignedTo: { OR: [{ firstName: { contains: q.q, mode: "insensitive" } }, { lastName: { contains: q.q, mode: "insensitive" } }] } },
          ],
        }
      : {}),
  };
  // ponytail: no pagination; add it when an org tracks more than a few thousand assets.
  return prisma.asset.findMany({ where, orderBy: { tag: "asc" }, include: { assignedTo: assignee } });
}

export async function assetCategories() {
  const rows = await prisma.asset.groupBy({ by: ["category"], orderBy: { category: "asc" } });
  return rows.map((r) => r.category);
}

export async function getAsset(id: string) {
  const a = await prisma.asset.findUnique({ where: { id }, include: { assignedTo: assignee } });
  if (!a) throw notFound("Asset");
  return a;
}

export function assetHistory(id: string) {
  return prisma.auditLog.findMany({
    where: { entity: "Asset", entityId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: { id: true, action: true, after: true, createdAt: true, actor: { select: { email: true, employee: { select: { firstName: true, lastName: true, preferredName: true } } } } },
  });
}

export const assetsForEmployee = (employeeId: string) => prisma.asset.findMany({ where: { assignedToId: employeeId }, orderBy: { tag: "asc" } });

const data = (d: AssetInput) => ({
  tag: d.tag,
  name: d.name,
  category: d.category,
  serialNumber: d.serialNumber ?? null,
  purchaseDate: d.purchaseDate ? new Date(d.purchaseDate) : null,
  cost: d.cost ?? null,
  notes: d.notes ?? null,
});

export async function saveAsset(actor: SessionUser, d: AssetInput, id?: string) {
  const dup = await prisma.asset.findUnique({ where: { tag: d.tag }, select: { id: true } });
  if (dup && dup.id !== id) throw conflict(`Asset tag ${d.tag} is already in use`);
  const row = id ? await prisma.asset.update({ where: { id }, data: data(d) }) : await prisma.asset.create({ data: data(d) });
  await audit(actor.id, id ? "asset.update" : "asset.create", "Asset", row.id, { after: { ...d } });
  return row;
}

export async function assignAsset(actor: SessionUser, id: string, employeeId: string) {
  const [a, e] = await Promise.all([getAsset(id), prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { firstName: true, lastName: true, preferredName: true } })]);
  if (!e) throw notFound("Employee");
  if (a.status === "RETIRED") throw new AppError("Retired assets cannot be assigned");
  await prisma.asset.update({ where: { id }, data: { assignedToId: employeeId, assignedAt: new Date(), status: "ASSIGNED" } });
  await audit(actor.id, "asset.assign", "Asset", id, { after: { to: `${e.preferredName ?? e.firstName} ${e.lastName}`, employeeId } });
}

/** Return to stock, or send to repair / retire (both also unassign). */
export async function setAssetStatus(actor: SessionUser, id: string, status: "AVAILABLE" | "REPAIR" | "RETIRED") {
  const a = await getAsset(id);
  await prisma.asset.update({ where: { id }, data: { status, assignedToId: null, assignedAt: null } });
  const from = a.assignedTo ? `${a.assignedTo.preferredName ?? a.assignedTo.firstName} ${a.assignedTo.lastName}` : undefined;
  await audit(actor.id, status === "AVAILABLE" ? (a.assignedTo ? "asset.return" : "asset.available") : status === "REPAIR" ? "asset.repair" : "asset.retire", "Asset", id, { after: { from } });
}

export async function deleteAsset(actor: SessionUser, id: string) {
  const a = await prisma.asset.delete({ where: { id } });
  await audit(actor.id, "asset.delete", "Asset", id, { before: { tag: a.tag, name: a.name } });
}
