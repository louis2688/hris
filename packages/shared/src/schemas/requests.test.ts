import { describe, expect, it } from "vitest";
import { expenseSchema, loanSchema, otMinutes, otRange, overtimeSchema } from "./requests";

describe("requests", () => {
  it("computes OT minutes, crossing midnight", () => {
    expect(otMinutes("18:00", "20:30")).toBe(150);
    expect(otMinutes("22:00", "02:00")).toBe(240);
    expect(otRange("23:00", "01:00")).toEqual([1380, 1500]);
  });
  it("validates overtime", () => {
    expect(overtimeSchema.safeParse({ date: "2026-09-01", startTime: "18:00", endTime: "18:00", reason: "x" }).success).toBe(false);
    expect(overtimeSchema.safeParse({ date: "2026-09-01", startTime: "18:00", endTime: "21:00", reason: "Release" }).success).toBe(true);
  });
  it("validates peso amounts", () => {
    const ok = (amount: string) => expenseSchema.safeParse({ date: "2026-09-01", category: "Meals", amount, description: "x" }).success;
    expect(ok("1,250.50")).toBe(true);
    expect(ok("0")).toBe(false);
    expect(ok("10.123")).toBe(false);
    expect(ok("-5")).toBe(false);
  });
  it("rejects amortization above principal", () => {
    const r = loanSchema.safeParse({ type: "CASH_ADVANCE", principal: "1000", amortization: "1500", startDate: "2026-10-15" });
    expect(r.success).toBe(false);
  });
});
