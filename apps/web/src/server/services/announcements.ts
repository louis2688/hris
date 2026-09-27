import "server-only";
import { prisma } from "@hris/db";
import type { AnnouncementInput, SessionUser } from "@hris/shared";
import { isStaff } from "../authz";
import { audit, notify } from "./audit";
import { AppError, notFound } from "./errors";

const author = { select: { email: true, employee: { select: { firstName: true, lastName: true, preferredName: true, avatarUrl: true } } } };
const activeUsers = { isActive: true };

/** Published feed (pinned first, newest next) + staff extras: drafts, ack progress, who has not acked. */
export async function listAnnouncements(u: SessionUser) {
  const staff = isStaff(u);
  const [items, drafts, audience] = await Promise.all([
    prisma.announcement.findMany({
      where: { publishedAt: { not: null } },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 50,
      include: {
        author,
        acks: { where: { userId: u.id }, select: { ackedAt: true } },
        ...(staff ? { _count: { select: { acks: { where: { user: activeUsers } } } } } : {}),
      },
    }),
    staff ? prisma.announcement.findMany({ where: { publishedAt: null }, orderBy: { updatedAt: "desc" }, include: { author } }) : Promise.resolve([]),
    staff ? prisma.user.count({ where: activeUsers }) : Promise.resolve(0),
  ]);
  // ponytail: one query per policy for the "not yet acknowledged" list, capped at 50 names; the CSV has everyone.
  const pendingByPolicy = new Map(
    staff
      ? await Promise.all(
          items
            .filter((a) => a.requiresAck)
            .map(async (a) => [a.id, await pendingAckUsers(a.id, 50)] as const),
        )
      : [],
  );
  return { items, drafts, audience, pendingByPolicy };
}

function pendingAckUsers(announcementId: string, take?: number) {
  return prisma.user.findMany({
    where: { ...activeUsers, acks: { none: { announcementId } } },
    select: { id: true, email: true, employee: { select: { id: true, firstName: true, lastName: true, preferredName: true } } },
    orderBy: { email: "asc" },
    take,
  });
}

export async function saveAnnouncement(actor: SessionUser, d: AnnouncementInput, id?: string) {
  const row = id
    ? await prisma.announcement.update({ where: { id }, data: d })
    : await prisma.announcement.create({ data: { ...d, authorId: actor.id } });
  await audit(actor.id, id ? "announcement.update" : "announcement.create", "Announcement", row.id, { after: { title: row.title, pinned: row.pinned, requiresAck: row.requiresAck } });
  return row;
}

export async function deleteAnnouncement(actor: SessionUser, id: string) {
  const row = await prisma.announcement.delete({ where: { id } });
  await audit(actor.id, "announcement.delete", "Announcement", id, { before: { title: row.title } });
}

export async function setPinned(actor: SessionUser, id: string, pinned: boolean) {
  await prisma.announcement.update({ where: { id }, data: { pinned } });
  await audit(actor.id, pinned ? "announcement.pin" : "announcement.unpin", "Announcement", id);
}

/** Publish once and notify every active user in bounded parallel chunks. */
export async function publishAnnouncement(actor: SessionUser, id: string) {
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) throw notFound("Announcement");
  if (a.publishedAt) throw new AppError("Already published");
  await prisma.announcement.update({ where: { id }, data: { publishedAt: new Date() } });
  await audit(actor.id, "announcement.publish", "Announcement", id, { after: { title: a.title } });
  const users = await prisma.user.findMany({ where: activeUsers, select: { id: true } });
  const title = a.requiresAck ? `Policy to acknowledge: ${a.title}` : `Announcement: ${a.title}`;
  // Plain-text preview: drop markdown syntax, collapse whitespace.
  const plain = a.body.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, "").replace(/\s+/g, " ").trim();
  const body = plain.length > 140 ? `${plain.slice(0, 137)}...` : plain;
  for (let i = 0; i < users.length; i += 25) {
    await Promise.all(users.slice(i, i + 25).map((x) => notify(x.id, title, body, "/announcements")));
  }
  return users.length;
}

export async function acknowledge(u: SessionUser, id: string) {
  const a = await prisma.announcement.findUnique({ where: { id }, select: { requiresAck: true, publishedAt: true } });
  if (!a?.publishedAt) throw notFound("Announcement");
  if (!a.requiresAck) throw new AppError("This announcement does not need acknowledgment");
  await prisma.announcementAck.upsert({ where: { announcementId_userId: { announcementId: id, userId: u.id } }, update: {}, create: { announcementId: id, userId: u.id } });
}

/** Every active user with ack status, for the CSV. */
export async function ackRows(id: string) {
  const a = await prisma.announcement.findUnique({ where: { id }, select: { title: true } });
  if (!a) throw notFound("Announcement");
  const users = await prisma.user.findMany({
    where: activeUsers,
    select: { email: true, employee: { select: { employeeCode: true, firstName: true, lastName: true, preferredName: true } }, acks: { where: { announcementId: id }, select: { ackedAt: true } } },
    orderBy: { email: "asc" },
  });
  return { title: a.title, users };
}

/** Mobile/API feed shape. */
export async function feedForApi(u: SessionUser) {
  const items = await prisma.announcement.findMany({
    where: { publishedAt: { not: null } },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take: 50,
    select: { id: true, title: true, body: true, pinned: true, requiresAck: true, publishedAt: true, author, acks: { where: { userId: u.id }, select: { ackedAt: true } } },
  });
  return items.map(({ acks, author: au, ...a }) => ({
    ...a,
    author: au?.employee ? `${au.employee.preferredName ?? au.employee.firstName} ${au.employee.lastName}` : (au?.email ?? null),
    ackedAt: acks[0]?.ackedAt ?? null,
  }));
}

/** Dashboard strip: the top pinned or still-unacknowledged announcement, plus open own onboarding tasks. */
export async function dashboardStrip(u: SessionUser) {
  const [announcement, openTasks] = await Promise.all([
    prisma.announcement.findFirst({
      where: { publishedAt: { not: null }, OR: [{ pinned: true }, { requiresAck: true, acks: { none: { userId: u.id } } }] },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      select: { id: true, title: true, requiresAck: true, publishedAt: true, acks: { where: { userId: u.id }, select: { ackedAt: true } } },
    }),
    u.employeeId
      ? prisma.employeeTask.count({ where: { owner: "EMPLOYEE", doneAt: null, checklist: { employeeId: u.employeeId, completedAt: null } } })
      : Promise.resolve(0),
  ]);
  return { announcement, openTasks };
}
