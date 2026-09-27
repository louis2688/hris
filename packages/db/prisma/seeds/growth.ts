/**
 * Demo goals (one cascaded), 1:1s, training, an anonymous eNPS pulse and peer feedback.
 * Idempotent: rows are keyed on (employee, title) / (event title) / (survey title).
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.js";

const day = (offset: number) => {
  const t = new Date(Date.now() + 8 * 3600_000); // Asia/Manila
  t.setUTCHours(0, 0, 0, 0);
  t.setUTCDate(t.getUTCDate() + offset);
  return t;
};
/** Manila wall time on day+offset -> UTC instant. */
const at = (offset: number, hh: number) => new Date(day(offset).getTime() + (hh - 8) * 3600_000);

export async function seedGrowth(prisma: PrismaClient) {
  const byEmail = async (email: string) => prisma.employee.findFirst({ where: { user: { email } }, select: { id: true, departmentId: true } });
  const [emp, mgr] = await Promise.all([byEmail("employee@hris.local"), byEmail("manager@hris.local")]);
  const hr = await prisma.user.findUnique({ where: { email: "hr@hris.local" }, select: { id: true } });
  if (!emp || !mgr) return console.log("seedGrowth: demo users missing, skipped");
  const cycle = await prisma.reviewCycle.findFirst({ where: { status: "ACTIVE" }, orderBy: { periodStart: "desc" } });
  const code = (c: string) => prisma.employee.findUnique({ where: { employeeCode: c }, select: { id: true, departmentId: true } });

  // ---- Goals ----
  const goal = async (employeeId: string, title: string, d: { kra: string; weight: number; progress: number; status: "NOT_STARTED" | "ON_TRACK" | "AT_RISK" | "DONE"; due: number; parentId?: string; description?: string }) =>
    (await prisma.goal.findFirst({ where: { employeeId, title } })) ??
    (await prisma.goal.create({
      data: { employeeId, title, cycleId: cycle?.id, kra: d.kra, weight: d.weight, progress: d.progress, status: d.status, dueDate: day(d.due), parentId: d.parentId, description: d.description },
    }));
  const teamGoal = await goal(mgr.id, "Ship the HRIS mobile app to all employees", { kra: "Delivery", weight: 60, progress: 45, status: "ON_TRACK", due: 60 });
  await goal(mgr.id, "Grow two engineers into tech leads", { kra: "People", weight: 40, progress: 30, status: "AT_RISK", due: 90 });
  await goal(emp.id, "Build offline punch sync for the mobile app", { kra: "Delivery", weight: 50, progress: 60, status: "ON_TRACK", due: 45, parentId: teamGoal.id, description: "Queue punches locally and sync when back online." });
  await goal(emp.id, "Raise API test coverage to 80%", { kra: "Quality", weight: 30, progress: 80, status: "ON_TRACK", due: 30 });
  await goal(emp.id, "Mentor one junior engineer", { kra: "People", weight: 20, progress: 20, status: "NOT_STARTED", due: 90 });

  // ---- 1:1s ----
  if (!(await prisma.oneOnOne.findFirst({ where: { managerId: mgr.id, employeeId: emp.id, date: day(-14) } }))) {
    await prisma.oneOnOne.create({
      data: {
        managerId: mgr.id,
        employeeId: emp.id,
        date: day(-14),
        agenda: "- Offline sync design\n- Conference budget",
        notes: "Agreed on an IndexedDB queue with server-side dedupe. Conference budget approved for Q1.",
        actionItems: [
          { text: "Write the offline sync design doc", done: true },
          { text: "Book DevCon Manila tickets", done: false },
        ],
      },
    });
  }
  if (!(await prisma.oneOnOne.findFirst({ where: { managerId: mgr.id, employeeId: emp.id, date: day(7) } }))) {
    await prisma.oneOnOne.create({ data: { managerId: mgr.id, employeeId: emp.id, date: day(7), agenda: "- Mid-cycle goal check-in" } });
  }

  // ---- Training ----
  const program =
    (await prisma.trainingProgram.findFirst({ where: { name: "Secure Coding Essentials" } })) ??
    (await prisma.trainingProgram.create({ data: { name: "Secure Coding Essentials", provider: "In-house", description: "OWASP Top 10, secrets handling and secure code review." } }));
  const event = async (title: string, start: number, status: "SCHEDULED" | "COMPLETED", extra: { location: string; trainer: string; cost: string; capacity: number }) =>
    (await prisma.trainingEvent.findFirst({ where: { title } })) ??
    (await prisma.trainingEvent.create({ data: { programId: program.id, title, startsAt: at(start, 9), endsAt: at(start, 17), status, ...extra } }));
  const past = await event("Secure Coding Essentials - Batch 1", -30, "COMPLETED", { location: "Manila HQ, Room 3", trainer: "Jomar Dela Cruz", cost: "2500", capacity: 12 });
  const next = await event("Secure Coding Essentials - Batch 2", 14, "SCHEDULED", { location: "Manila HQ, Room 3", trainer: "Jomar Dela Cruz", cost: "2500", capacity: 12 });
  await prisma.trainingAttendee.upsert({
    where: { eventId_employeeId: { eventId: past.id, employeeId: emp.id } },
    update: {},
    create: { eventId: past.id, employeeId: emp.id, status: "ATTENDED", result: "PASSED", score: 92, feedbackRating: 5, feedback: "Hands-on labs were great." },
  });
  const invitees = (await Promise.all(["EMP-0004", "EMP-0005", "EMP-0006"].map(code))).filter((x) => !!x);
  await prisma.trainingAttendee.createMany({ data: invitees.map((x) => ({ eventId: next.id, employeeId: x.id })), skipDuplicates: true });

  // ---- Anonymous eNPS pulse: 8 responses, not from the demo employee ----
  const title = "Pulse check: how are we doing?";
  if (!(await prisma.survey.findFirst({ where: { title } }))) {
    const survey = await prisma.survey.create({
      data: {
        title,
        description: "Two minutes, fully anonymous.",
        anonymous: true,
        status: "OPEN",
        opensAt: day(-3),
        closesAt: day(11),
        createdById: hr?.id,
        questions: [
          { id: "enps", type: "nps", text: "How likely are you to recommend working here to a friend?", required: true },
          { id: "support", type: "rating", text: "How supported do you feel by your manager?", required: true },
          { id: "change", type: "text", text: "What is one thing we should change?", required: false },
        ],
      },
    });
    const who = (await Promise.all(["EMP-0001", "EMP-0002", "EMP-0003", "EMP-0005", "EMP-0006", "EMP-0007", "EMP-0008", "EMP-0009"].map(code))).filter((x) => !!x);
    const scores: [number, number, string?][] = [[10, 5, "More pairing time."], [9, 4], [8, 4, "Faster laptop refresh."], [9, 5], [6, 3, "Clearer promotion criteria."], [10, 4], [7, 4], [3, 2, "Too many meetings."]];
    for (const [i, e] of who.entries()) {
      const [n, r, txt] = scores[i]!;
      const answers = { enps: n, support: r, ...(txt ? { change: txt } : {}), ...(e.departmentId ? { _dept: e.departmentId } : {}) };
      await prisma.surveyParticipation.create({ data: { surveyId: survey.id, employeeId: e.id, submittedAt: day(-1) } });
      await prisma.surveyResponse.create({ data: { id: randomUUID(), surveyId: survey.id, answers, submittedAt: day(-1) } });
    }
  }

  // ---- Peer feedback on the demo employee's active review ----
  const review = cycle ? await prisma.performanceReview.findUnique({ where: { cycleId_employeeId: { cycleId: cycle.id, employeeId: emp.id } } }) : null;
  const [paolo, kristine] = await Promise.all([code("EMP-0005"), code("EMP-0006")]);
  if (review && paolo && kristine) {
    await prisma.peerFeedback.createMany({ data: [{ reviewId: review.id, reviewerId: paolo.id }], skipDuplicates: true });
    await prisma.peerFeedback.upsert({
      where: { reviewId_reviewerId: { reviewId: review.id, reviewerId: kristine.id } },
      update: {},
      create: { reviewId: review.id, reviewerId: kristine.id, rating: 5, strengths: "Unblocks QA quickly and writes clear bug repros.", improvements: "Share design docs earlier.", submittedAt: day(-2) },
    });
  }
  console.log("seedGrowth: done");
}
