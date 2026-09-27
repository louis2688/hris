/**
 * Hiring demo: public careers listings, a sent job offer (fixed token), interview scorecards and a referred candidate.
 * Idempotent: keyed on vacancy title, candidate email and (interview, interviewer).
 */
import type { PrismaClient } from "../../generated/prisma/client.js";

/** Fixed demo token so the public offer page can be opened straight from the seed log. 43 chars like a real one. */
export const DEMO_OFFER_TOKEN = "demo_offer_patricia_gomez".padEnd(43, "0");

const day = (offset: number) => {
  const t = new Date(Date.now() + 8 * 3600_000); // Asia/Manila calendar day
  t.setUTCHours(0, 0, 0, 0);
  t.setUTCDate(t.getUTCDate() + offset);
  return t;
};

export async function seedHiring(prisma: PrismaClient) {
  const emp = async (code: string) => (await prisma.employee.findUnique({ where: { employeeCode: code }, select: { id: true } }))?.id ?? null;
  const [backend, support, jomar, maricel, bianca] = await Promise.all([
    prisma.vacancy.findFirst({ where: { title: "Backend Software Engineer" } }),
    prisma.vacancy.findFirst({ where: { title: "Customer Support Specialist" } }),
    emp("EMP-0003"),
    emp("EMP-0002"),
    emp("EMP-0004"),
  ]);
  if (!backend || !support) return console.log("seedHiring: demo vacancies missing, skipped");

  await prisma.vacancy.update({
    where: { id: backend.id },
    data: {
      isPublic: true,
      slug: backend.slug ?? "backend-software-engineer",
      referralBonus: 5000,
      description:
        "Build and run our Java/Spring and Node services.\n\nWhat you'll do\n- Design and ship APIs used by thousands of employees\n- Own services end to end, from design to on-call\n- Review code and mentor junior engineers\n\nWhat we're looking for\n- 3+ years of backend experience (Java/Spring or Node.js)\n- Solid SQL and PostgreSQL skills\n- Clear written communication\n\nHybrid setup, 3 days a week at our Ortigas office. HMO from day one.",
    },
  });
  await prisma.vacancy.update({
    where: { id: support.id },
    data: {
      isPublic: true,
      slug: support.slug ?? "customer-support-specialist",
      description:
        "Handle customer chats and email for our HR platform.\n\nWhat you'll do\n- Answer customer questions by chat and email\n- Log and follow up on product issues\n- Keep our help center articles up to date\n\nWhat we're looking for\n- 1+ year in customer support or BPO\n- Excellent written English and Filipino\n- Comfortable on a night shift (with night differential)\n\nBased in our Cebu office.",
    },
  });

  // SENT offer for the offered candidate.
  const patricia = await prisma.candidate.findFirst({ where: { email: "patricia.gomez@example.com", vacancyId: support.id } });
  if (patricia && !(await prisma.jobOffer.findFirst({ where: { candidateId: patricia.id } }))) {
    await prisma.jobOffer.create({
      data: {
        candidateId: patricia.id,
        jobTitleId: support.jobTitleId,
        departmentId: support.departmentId,
        employmentType: "FULL_TIME",
        payType: "MONTHLY",
        basicPay: 24000,
        allowance: 2000,
        startDate: day(21),
        expiresAt: day(10),
        status: "SENT",
        sentAt: day(-1),
        token: DEMO_OFFER_TOKEN,
        terms: [
          { label: "Probationary period", value: "6 months" },
          { label: "Work schedule", value: "Night shift, 10:00 PM - 7:00 AM, 5 days a week" },
          { label: "Night differential", value: "10% of hourly rate for work between 10 PM and 6 AM" },
          { label: "HMO", value: "Covered from day one" },
          { label: "13th month pay", value: "As mandated by PD 851" },
        ],
      },
    });
  }
  const offer = await prisma.jobOffer.findUnique({ where: { token: DEMO_OFFER_TOKEN }, select: { status: true } });
  if (offer) console.log(`seedHiring: demo offer (${offer.status}) at /offer/${DEMO_OFFER_TOKEN}`);

  // Scorecards on the pending technical interview.
  const mark = await prisma.candidate.findFirst({ where: { email: "mark.villareal@example.com", vacancyId: backend.id }, include: { interviews: { take: 1, orderBy: { scheduledAt: "asc" } } } });
  const interview = mark?.interviews[0];
  if (interview) {
    const cards = [
      { interviewerId: jomar, scores: { Communication: 4, "Technical skills": 5, "Problem solving": 4, "Culture add": 4, "Role fit": 5 }, rating: 5, recommendation: "STRONG_YES" as const, comments: "Strong Spring Boot depth; designed a clean idempotent payments API on the whiteboard." },
      { interviewerId: maricel, scores: { Communication: 4, "Culture add": 3, "Role fit": 4 }, rating: 4, recommendation: "YES" as const, comments: "Clear communicator. Salary expectation is at the top of our band." },
    ];
    for (const c of cards) {
      if (!c.interviewerId) continue;
      const { interviewerId, ...data } = c;
      await prisma.interviewFeedback.upsert({ where: { interviewId_interviewerId: { interviewId: interview.id, interviewerId } }, update: {}, create: { interviewId: interview.id, interviewerId, ...data } });
    }
    if (interview.round === 1 && !(await prisma.interview.findFirst({ where: { candidateId: mark.id, round: 2 } }))) {
      await prisma.interview.create({ data: { candidateId: mark.id, title: "Final interview", round: 2, scheduledAt: new Date(day(7).getTime() + 6 * 3600_000), interviewerId: maricel, location: "Ortigas HQ, Room 3" } });
    }
  }

  // Referred applicant from the careers page.
  if (bianca && !(await prisma.candidate.findFirst({ where: { email: "andrea.lopez@example.com", vacancyId: backend.id } }))) {
    await prisma.candidate.create({
      data: { firstName: "Andrea", lastName: "Lopez", email: "andrea.lopez@example.com", phone: "+63 917 555 0199", vacancyId: backend.id, source: "Referral", referrerId: bianca, consentAt: new Date() },
    });
  }
}
