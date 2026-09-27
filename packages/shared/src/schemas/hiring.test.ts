import { describe, expect, it } from "vitest";
import { careersApplySchema, namesMatch, offerSchema, referralBonusDue, slugify, summarizeFeedback, termsFromForm } from "./hiring";

const today = new Date("2026-09-27T00:00:00Z");
const base = {
  referrerId: "emp_ref",
  referralBonusAdjustmentId: null,
  bonus: 5000,
  hire: { hireDate: new Date("2026-06-29T00:00:00Z"), employmentStatus: "PROBATION", terminationDate: null, deletedAt: null },
};

describe("referralBonusDue", () => {
  it("pays once the hire is exactly 90 days in", () => {
    expect(referralBonusDue(base, today)).toBe(true);
    expect(referralBonusDue({ ...base, hire: { ...base.hire, hireDate: new Date("2026-06-30T00:00:00Z") } }, today)).toBe(false);
  });
  it("skips already-paid, unreferred, unhired and zero-bonus candidates", () => {
    expect(referralBonusDue({ ...base, referralBonusAdjustmentId: "adj_1" }, today)).toBe(false);
    expect(referralBonusDue({ ...base, referrerId: null }, today)).toBe(false);
    expect(referralBonusDue({ ...base, hire: null }, today)).toBe(false);
    expect(referralBonusDue({ ...base, bonus: 0 }, today)).toBe(false);
    expect(referralBonusDue({ ...base, bonus: null }, today)).toBe(false);
  });
  it("skips separated hires", () => {
    expect(referralBonusDue({ ...base, hire: { ...base.hire, employmentStatus: "RESIGNED" } }, today)).toBe(false);
    expect(referralBonusDue({ ...base, hire: { ...base.hire, employmentStatus: "TERMINATED" } }, today)).toBe(false);
    expect(referralBonusDue({ ...base, hire: { ...base.hire, terminationDate: new Date("2026-09-01T00:00:00Z") } }, today)).toBe(false);
    expect(referralBonusDue({ ...base, hire: { ...base.hire, deletedAt: new Date() } }, today)).toBe(false);
    expect(referralBonusDue({ ...base, hire: { ...base.hire, employmentStatus: "ACTIVE" } }, today)).toBe(true);
  });
});

describe("offers", () => {
  it("matches typed signatures case- and space-insensitively", () => {
    expect(namesMatch("  patricia   GOMEZ ", "Patricia Gomez")).toBe(true);
    expect(namesMatch("Patricia", "Patricia Gomez")).toBe(false);
    expect(namesMatch("", "")).toBe(false);
  });
  it("collects term rows and drops blanks", () => {
    expect(termsFromForm({ termLabel: ["HMO", "", "13th month"], termValue: ["Yes", "x", ""] })).toEqual([{ label: "HMO", value: "Yes" }]);
    expect(termsFromForm({ termLabel: "Probation", termValue: "6 months" })).toEqual([{ label: "Probation", value: "6 months" }]);
  });
  it("requires expiry on or before the start date", () => {
    const d = { basicPay: "30000", startDate: "2026-10-15", expiresAt: "2026-10-20" };
    expect(offerSchema.safeParse(d).success).toBe(false);
    expect(offerSchema.safeParse({ ...d, expiresAt: "2026-10-05" }).success).toBe(true);
  });
});

describe("scorecards", () => {
  it("averages per criterion and counts recommendations", () => {
    const s = summarizeFeedback(
      [
        { scores: { Communication: 4, "Role fit": 5 }, rating: 4, recommendation: "YES" },
        { scores: { Communication: 3 }, rating: 3, recommendation: "STRONG_YES" },
      ],
      ["Communication", "Role fit", "Culture add"],
    );
    expect(s.rating).toBe(3.5);
    expect(s.perCriterion).toEqual([
      { criterion: "Communication", avg: 3.5 },
      { criterion: "Role fit", avg: 5 },
    ]);
    expect(s.counts).toEqual({ STRONG_YES: 1, YES: 1, NO: 0, STRONG_NO: 0 });
  });
});

describe("careers", () => {
  it("slugifies titles", () => {
    expect(slugify("Customer Support Specialist (Cebu)")).toBe("customer-support-specialist-cebu");
    expect(slugify("Señor Engineer")).toBe("senor-engineer");
  });
  it("requires Data Privacy Act consent", () => {
    const d = { firstName: "A", lastName: "B", email: "a@b.co", phone: "09171234567" };
    expect(careersApplySchema.safeParse(d).success).toBe(false);
    expect(careersApplySchema.safeParse({ ...d, consent: true }).success).toBe(true);
  });
});
