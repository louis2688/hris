import { describe, expect, it } from "vitest";
import { countLeaveDays } from "./leave-days";

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
