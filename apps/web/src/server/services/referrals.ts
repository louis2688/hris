import "server-only";

/**
 * Daily job hook (called from /api/cron/daily): for hired referrals whose hire date passed 90 days
 * and whose vacancy has a referralBonus, create a PayrollAdjustment for the referrer (once).
 * TODO(hiring agent): implement. Signature is a contract with the cron route; keep it.
 */
export async function runDailyReferralBonuses(): Promise<number> {
  return 0;
}
