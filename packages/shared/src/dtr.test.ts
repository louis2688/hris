import { describe, expect, it } from "vitest";
import { attendanceSlot, computeDtr, DEFAULT_SHIFT, monthDays, zonedToUtc } from "./dtr";

const TZ = "Asia/Manila";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const base = { shift: DEFAULT_SHIFT, timeZone: TZ, holidays: new Map<string, string>(), leaves: new Map<string, { code: string; days: number }>(), today: "2026-12-31" };

describe("zonedToUtc", () => {
  it("Manila 09:00 is 01:00 UTC", () => {
    expect(at("2026-10-05", "09:00").toISOString()).toBe("2026-10-05T01:00:00.000Z");
  });
});

describe("computeDtr", () => {
  it("on time full day", () => {
    const { rows } = computeDtr({ ...base, days: ["2026-10-05"], punches: [at("2026-10-05", "08:55"), at("2026-10-05", "18:02")] });
    expect(rows[0]).toMatchObject({ status: "PRESENT", timeIn: "08:55", timeOut: "18:02", lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 2, workedMinutes: 487 });
  });
  it("late and undertime", () => {
    const { rows, totals } = computeDtr({ ...base, days: ["2026-10-05"], punches: [at("2026-10-05", "09:20"), at("2026-10-05", "17:30")] });
    expect(rows[0]).toMatchObject({ lateMinutes: 20, undertimeMinutes: 30, overtimeMinutes: 0 });
    expect(totals.lateCount).toBe(1);
  });
  it("grace period", () => {
    const { rows } = computeDtr({ ...base, shift: { ...DEFAULT_SHIFT, graceMinutes: 15 }, days: ["2026-10-05"], punches: [at("2026-10-05", "09:10"), at("2026-10-05", "18:00")] });
    expect(rows[0]!.lateMinutes).toBe(0);
  });
  it("absent, rest day, holiday, leave, upcoming", () => {
    const { rows, totals } = computeDtr({
      ...base,
      today: "2026-10-09",
      days: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-10", "2026-10-12"],
      punches: [],
      holidays: new Map([["2026-10-06", "Holiday"]]),
      leaves: new Map([["2026-10-07", { code: "VL", days: 1 }]]),
    });
    expect(rows.map((r) => r.status)).toEqual(["ABSENT", "HOLIDAY", "LEAVE", "REST_DAY", "UPCOMING"]);
    expect(totals.absent).toBe(1);
  });
  it("single punch is incomplete", () => {
    const { rows } = computeDtr({ ...base, days: ["2026-10-05"], punches: [at("2026-10-05", "09:30")] });
    expect(rows[0]).toMatchObject({ status: "INCOMPLETE", lateMinutes: 30, timeOut: null });
  });
  it("night shift crosses midnight", () => {
    const night = { ...DEFAULT_SHIFT, startTime: "22:00", endTime: "06:00" };
    expect(attendanceSlot(at("2026-10-06", "05:45"), night, TZ).day).toBe("2026-10-05");
    const { rows } = computeDtr({ ...base, shift: night, days: ["2026-10-05"], punches: [at("2026-10-05", "22:05"), at("2026-10-06", "06:30")] });
    expect(rows[0]).toMatchObject({ status: "PRESENT", timeIn: "22:05", timeOut: "06:30", lateMinutes: 5, overtimeMinutes: 30 });
  });
  it("monthDays", () => {
    expect(monthDays("2026-02")).toHaveLength(28);
  });
});
