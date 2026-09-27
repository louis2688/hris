import "server-only";
import { prisma } from "@hris/db";
import { referralBonusDue, REFERRAL_MIN_DAYS } from "@hris/shared";
import { audit, notify } from "./audit";
import { manilaToday } from "./onboarding";

/**
 * Daily job hook (called from /api/cron/daily): for hired referrals whose hire date passed 90 days
 * and whose vacancy has a referralBonus, create a PayrollAdjustment for the referrer (once).
 * Returns how many bonuses were created.
 */
export async function runDailyReferralBonuses(): Promise<number> {
  const today = manilaToday();
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - REFERRAL_MIN_DAYS);
  // Coarse DB filter; referralBonusDue() is the rule of record.
  const rows = await prisma.candidate.findMany({
    where: { referrerId: { not: null }, referralBonusAdjustmentId: null, hiredEmployeeId: { not: null }, vacancy: { referralBonus: { gt: 0 } }, hiredEmployee: { hireDate: { lte: cutoff } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      referrerId: true,
      referralBonusAdjustmentId: true,
      vacancy: { select: { title: true, referralBonus: true } },
      hiredEmployee: { select: { hireDate: true, employmentStatus: true, terminationDate: true, deletedAt: true } },
      referrer: { select: { userId: true, deletedAt: true } },
    },
  });

  let created = 0;
  for (const c of rows) {
    if (!c.referrer || c.referrer.deletedAt) continue;
    if (!referralBonusDue({ ...c, bonus: c.vacancy?.referralBonus ? Number(c.vacancy.referralBonus) : null, hire: c.hiredEmployee }, today)) continue;
    const name = `${c.firstName} ${c.lastName}`;
    const adj = await prisma.$transaction(async (tx) => {
      // Guard: only the run that flips the null wins, so overlapping runs can't double-pay.
      const a = await tx.payrollAdjustment.create({
        data: { employeeId: c.referrerId!, kind: "EARNING", code: "REFERRAL", label: `Referral bonus - ${name}`, amount: c.vacancy!.referralBonus!, taxable: true, effectiveDate: today, note: `Hire passed ${REFERRAL_MIN_DAYS} days (${c.vacancy!.title})` },
      });
      const claimed = await tx.candidate.updateMany({ where: { id: c.id, referralBonusAdjustmentId: null }, data: { referralBonusAdjustmentId: a.id } });
      if (claimed.count !== 1) throw new Error("already-paid");
      return a;
    }).catch((e: Error) => (e.message === "already-paid" ? null : Promise.reject(e)));
    if (!adj) continue;
    created++;
    await audit(null, "candidate.referral_bonus", "Candidate", c.id, { after: { adjustmentId: adj.id, referrerId: c.referrerId, amount: adj.amount.toString() } });
    await notify(c.referrer.userId, "Referral bonus earned", `${name} passed ${REFERRAL_MIN_DAYS} days. Your referral bonus of PHP ${Number(adj.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} will be added to your next payroll.`, "/payslips");
  }
  return created;
}
