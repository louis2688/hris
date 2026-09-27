import { describe, expect, it } from "vitest";
import { accruedDays, completedAccrualMonths, countLeaveDays } from "./leave-days";

describe("countLeaveDays", () => {
  it("counts a full working week as 5", () => {
    // Mon 2026-10-05 .. Fri 2026-10-09
    expect(countLeaveDays("2026-10-05", "2026-10-09")).toBe(5);
  });
  it("skips weekends", () => {
    // Fri .. Mon
    expect(countLeaveDays("2026-10-09", "2026-10-12")).toBe(2);
  });
  it("handles half days at both ends", () => {
    expect(countLeaveDays("2026-10-05", "2026-10-07", "PM", "AM")).toBe(2);
  });
  it("single half day", () => {
    expect(countLeaveDays("2026-10-05", "2026-10-05", "AM", "FULL")).toBe(0.5);
    expect(countLeaveDays("2026-10-05", "2026-10-05", "FULL", "PM")).toBe(0.5);
  });
  it("excludes holidays", () => {
    expect(countLeaveDays("2026-10-05", "2026-10-09", "FULL", "FULL", { holidays: ["2026-10-07"] })).toBe(4);
  });
  it("returns 0 on weekend only", () => {
    expect(countLeaveDays("2026-10-10", "2026-10-11")).toBe(0);
  });
  it("returns 0 when end before start", () => {
    expect(countLeaveDays("2026-10-10", "2026-10-01")).toBe(0);
  });
});

describe("completedAccrualMonths / accruedDays", () => {
  it("counts months completed since Jan 1", () => {
    expect(completedAccrualMonths(2026, "2020-05-10", "2026-01-31")).toBe(0);
    expect(completedAccrualMonths(2026, "2020-05-10", "2026-02-01")).toBe(1);
    expect(completedAccrualMonths(2026, "2020-05-10", "2026-09-27")).toBe(8);
  });
  it("starts at the hire date for new hires", () => {
    expect(completedAccrualMonths(2026, "2026-03-15", "2026-04-14")).toBe(0);
    expect(completedAccrualMonths(2026, "2026-03-15", "2026-04-15")).toBe(1);
    expect(completedAccrualMonths(2026, "2026-03-15", "2026-09-14")).toBe(5);
  });
  it("uses the last day of short months", () => {
    expect(completedAccrualMonths(2026, "2026-01-31", "2026-02-27")).toBe(0);
    expect(completedAccrualMonths(2026, "2026-01-31", "2026-02-28")).toBe(1);
  });
  it("caps at the end of the year and is 0 before the start", () => {
    expect(completedAccrualMonths(2025, "2020-01-01", "2026-06-01")).toBe(12);
    expect(completedAccrualMonths(2025, "2025-12-15", "2026-06-01")).toBe(0);
    expect(completedAccrualMonths(2027, "2020-01-01", "2026-06-01")).toBe(0);
  });
  it("accrues and caps at the entitlement", () => {
    expect(accruedDays(15, 1.25, 2026, "2020-01-01", "2026-09-27")).toBe(10);
    expect(accruedDays(15, 1.25, 2025, "2020-01-01", "2026-09-27")).toBe(15);
    expect(accruedDays(12, 1.25, 2025, "2020-01-01", "2026-09-27")).toBe(12);
  });
});
