import "server-only";
import { prisma, type Prisma } from "@hris/db";
import { computeFinalRating, FINAL_RATING_SCALE, type KpiInput, type ReviewCycleInput, type ReviewFormInput, type SessionUser } from "@hris/shared";
import { AuthError } from "../auth/session";
import { isStaff } from "../authz";
import { audit, notify } from "./audit";
import { AppError, conflict, notFound } from "./errors";

const person = { select: { id: true, firstName: true, lastName: true, preferredName: true, avatarUrl: true } } as const;
const cycleLite = { select: { id: true, name: true, status: true, dueDate: true, periodStart: true, periodEnd: true } } as const;

// ---------- KPIs ----------

export const listKpis = () => prisma.kpi.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { jobTitle: { select: { name: true } } } });

export async function saveKpi(actor: SessionUser, d: KpiInput, id?: string) {
  const data = { name: d.name, description: d.description ?? null, jobTitleId: d.jobTitleId ?? null, minRating: d.minRating, maxRating: d.maxRating, isActive: d.isActive };
  const row = id ? await prisma.kpi.update({ where: { id }, data }) : await prisma.kpi.create({ data });
  await audit(actor.id, id ? "kpi.update" : "kpi.create", "Kpi", row.id, { after: row });
  return row;
}

export async function deleteKpi(actor: SessionUser, id: string) {
  // Review items keep their kpiName/min/max snapshot; kpiId is SetNull.
  await prisma.kpi.delete({ where: { id } });
  await audit(actor.id, "kpi.delete", "Kpi", id);
}

// ---------- Cycles ----------

export async function listCycles() {
  const [cycles, counts] = await Promise.all([
    prisma.reviewCycle.findMany({ orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }] }),
    prisma.performanceReview.groupBy({ by: ["cycleId", "status"], _count: { _all: true } }),
  ]);
  return cycles.map((c) => {
    const by = Object.fromEntries(counts.filter((x) => x.cycleId === c.id).map((x) => [x.status, x._count._all])) as Partial<Record<"SELF_REVIEW" | "MANAGER_REVIEW" | "COMPLETED", number>>;
    return { ...c, byStatus: by, total: (by.SELF_REVIEW ?? 0) + (by.MANAGER_REVIEW ?? 0) + (by.COMPLETED ?? 0) };
  });
}

export async function saveCycle(actor: SessionUser, d: ReviewCycleInput, id?: string) {
  const data = { name: d.name, periodStart: new Date(d.periodStart), periodEnd: new Date(d.periodEnd), dueDate: new Date(d.dueDate) };
  if (id) {
    const c = await prisma.reviewCycle.findUnique({ where: { id } });
    if (!c) throw notFound("Review cycle");
    if (c.status === "CLOSED") throw new AppError("Closed cycles cannot be edited");
  }
  const row = id ? await prisma.reviewCycle.update({ where: { id }, data }) : await prisma.reviewCycle.create({ data });
  await audit(actor.id, id ? "review_cycle.update" : "review_cycle.create", "ReviewCycle", row.id, { after: row });
  return row;
}

export async function deleteCycle(actor: SessionUser, id: string) {
  const { count } = await prisma.reviewCycle.deleteMany({ where: { id, status: "DRAFT" } });
  if (!count) throw new AppError("Only draft cycles can be deleted");
  await audit(actor.id, "review_cycle.delete", "ReviewCycle", id);
}

/** DRAFT -> ACTIVE: one review per eligible employee, reviewer = their manager, items snapshotted from KPIs. */
export async function activateCycle(actor: SessionUser, id: string) {
  const cycle = await prisma.reviewCycle.findUnique({ where: { id } });
  if (!cycle) throw notFound("Review cycle");
  if (cycle.status !== "DRAFT") throw new AppError("Only draft cycles can be activated");
  const [employees, kpis] = await Promise.all([
    prisma.employee.findMany({
      where: { deletedAt: null, employmentStatus: { notIn: ["RESIGNED", "TERMINATED"] }, hireDate: { lte: cycle.periodEnd } },
      select: { id: true, managerId: true, jobTitleId: true, userId: true },
    }),
    prisma.kpi.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!kpis.length) throw new AppError("Add at least one active KPI before activating");

  const reviews = await prisma.$transaction(async (tx) => {
    const { count } = await tx.reviewCycle.updateMany({ where: { id, status: "DRAFT" }, data: { status: "ACTIVE" } });
    if (!count) throw conflict("This cycle was changed by someone else. Reload and try again.");
    await tx.performanceReview.createMany({
      data: employees.map((e) => ({ cycleId: id, employeeId: e.id, reviewerId: e.managerId })),
      skipDuplicates: true,
    });
    const created = await tx.performanceReview.findMany({ where: { cycleId: id, items: { none: {} } }, select: { id: true, employeeId: true } });
    const byEmp = new Map(employees.map((e) => [e.id, e]));
    await tx.reviewItem.createMany({
      data: created.flatMap((r) =>
        kpis
          .filter((k) => !k.jobTitleId || k.jobTitleId === byEmp.get(r.employeeId)?.jobTitleId)
          .map((k) => ({ reviewId: r.id, kpiId: k.id, kpiName: k.name, minRating: k.minRating, maxRating: k.maxRating })),
      ),
    });
    return created;
  });

  await audit(actor.id, "review_cycle.activate", "ReviewCycle", id, { after: { reviews: reviews.length } });
  const due = cycle.dueDate.toISOString().slice(0, 10);
  const userOf = new Map(employees.map((e) => [e.id, e.userId]));
  // ponytail: notify() also emails (createMany would skip that), so 5 in flight at a time leaves pool room for other requests.
  for (let i = 0; i < reviews.length; i += 5) {
    await Promise.all(
      reviews.slice(i, i + 5).map((r) => notify(userOf.get(r.employeeId), `Performance review: ${cycle.name}`, `Please complete your self review by ${due}.`, `/performance/${r.id}`)),
    );
  }
  return { reviews: reviews.length };
}

export async function closeCycle(actor: SessionUser, id: string) {
  const { count } = await prisma.reviewCycle.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "CLOSED" } });
  if (!count) throw new AppError("Only active cycles can be closed");
  await audit(actor.id, "review_cycle.close", "ReviewCycle", id);
}

// ---------- Reviews ----------

export const myReviews = (employeeId: string) =>
  prisma.performanceReview.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" }, include: { cycle: cycleLite, reviewer: person } });

/** Reviews where `u` is the reviewer. HR/Admin also cover reviews that have no reviewer. */
export const teamReviews = (u: SessionUser) =>
  prisma.performanceReview.findMany({
    where: {
      OR: [...(u.employeeId ? [{ reviewerId: u.employeeId }] : []), ...(isStaff(u) ? [{ reviewerId: null }] : [])],
      ...(u.employeeId ? { employeeId: { not: u.employeeId } } : {}),
      cycle: { status: { not: "DRAFT" } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { cycle: cycleLite, employee: person },
  });

export const allReviews = (where: Prisma.PerformanceReviewWhereInput) =>
  prisma.performanceReview.findMany({
    where,
    orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }],
    include: { employee: person, reviewer: person },
  });

export async function getReview(u: SessionUser, id: string) {
  const r = await prisma.performanceReview.findUnique({
    where: { id },
    include: {
      cycle: cycleLite,
      employee: { select: { ...person.select, userId: true, jobTitle: { select: { name: true } } } },
      reviewer: { select: { ...person.select, userId: true } },
      items: { orderBy: { kpiName: "asc" }, include: { kpi: { select: { description: true } } } },
    },
  });
  if (!r) throw notFound("Review");
  if (!(isStaff(u) || r.employeeId === u.employeeId || (u.employeeId && r.reviewerId === u.employeeId))) throw new AuthError("Forbidden", 403);
  return r;
}
export type ReviewDetail = Awaited<ReturnType<typeof getReview>>;

/** Assigned reviewer, or HR/Admin when none is assigned. Nobody reviews themselves. */
export const isReviewerOf = (u: SessionUser, r: { reviewerId: string | null; employeeId: string }) =>
  r.employeeId !== u.employeeId && (r.reviewerId ? r.reviewerId === u.employeeId : isStaff(u));

/** Validates ratings against each item's snapshot range; on submit every item must be rated. */
function checkItems(r: ReviewDetail, d: ReviewFormInput) {
  const byId = new Map(r.items.map((i) => [i.id, i]));
  for (const x of d.items) {
    const it = byId.get(x.id);
    if (!it) throw new AppError("Unknown review item");
    if (x.rating != null && (x.rating < it.minRating || x.rating > it.maxRating)) throw new AppError(`${it.kpiName}: rating must be ${it.minRating}-${it.maxRating}`);
  }
  if (d.intent === "submit") {
    const rated = new Set(d.items.filter((x) => x.rating != null).map((x) => x.id));
    const missing = r.items.find((i) => !rated.has(i.id));
    if (missing) throw new AppError(`Rate "${missing.kpiName}" before submitting`);
  }
}

const assertOpen = (r: ReviewDetail) => {
  if (r.cycle.status !== "ACTIVE") throw new AppError("This review cycle is not open");
};

export async function saveSelfReview(u: SessionUser, id: string, d: ReviewFormInput) {
  const r = await getReview(u, id);
  if (r.employeeId !== u.employeeId) throw new AuthError("Only the employee can write the self review", 403);
  assertOpen(r);
  if (r.status !== "SELF_REVIEW") throw new AppError("Your self review was already submitted");
  checkItems(r, d);
  const submit = d.intent === "submit";
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.performanceReview.updateMany({
      where: { id, status: "SELF_REVIEW" },
      data: { selfComment: d.comment ?? null, ...(submit ? { status: "MANAGER_REVIEW", submittedAt: new Date() } : {}) },
    });
    if (!count) throw conflict("This review changed. Reload and try again.");
    for (const x of d.items) await tx.reviewItem.updateMany({ where: { id: x.id, reviewId: id }, data: { selfRating: x.rating ?? null, selfComment: x.comment ?? null } });
  });
  await audit(u.id, submit ? "review.self_submit" : "review.self_save", "PerformanceReview", id);
  if (submit) await notify(r.reviewer?.userId, `Review ready: ${r.employee.firstName} ${r.employee.lastName}`, `${r.cycle.name} self review submitted.`, `/performance/${id}`);
}

export async function saveManagerReview(u: SessionUser, id: string, d: ReviewFormInput) {
  const r = await getReview(u, id);
  if (!isReviewerOf(u, r)) throw new AuthError("You are not the reviewer", 403);
  assertOpen(r);
  if (r.status !== "MANAGER_REVIEW") throw new AppError(r.status === "SELF_REVIEW" ? "Waiting for the self review" : "This review is already completed");
  checkItems(r, d);
  const submit = d.intent === "submit";
  const byId = new Map(r.items.map((i) => [i.id, i]));
  const finalRating = submit ? computeFinalRating(d.items.map((x) => ({ rating: x.rating, minRating: byId.get(x.id)!.minRating, maxRating: byId.get(x.id)!.maxRating }))) : null;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.performanceReview.updateMany({
      where: { id, status: "MANAGER_REVIEW" },
      data: { managerComment: d.comment ?? null, ...(submit ? { status: "COMPLETED", completedAt: new Date(), finalRating } : {}) },
    });
    if (!count) throw conflict("This review changed. Reload and try again.");
    for (const x of d.items) await tx.reviewItem.updateMany({ where: { id: x.id, reviewId: id }, data: { managerRating: x.rating ?? null, managerComment: x.comment ?? null } });
  });
  await audit(u.id, submit ? "review.complete" : "review.manager_save", "PerformanceReview", id, submit ? { after: { finalRating } } : {});
  if (submit) await notify(r.employee.userId, `Review completed: ${r.cycle.name}`, finalRating != null ? `Final rating ${finalRating.toFixed(2)} / ${FINAL_RATING_SCALE}` : undefined, `/performance/${id}`);
}
