import { describe, expect, it } from "vitest";
import { attendanceSlot, computeDtr, DEFAULT_SHIFT, fmtDistance, geofenceCheck, haversineMeters, monthDays, nightOverlap, rangeTotals, zonedToUtc } from "./dtr";

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

describe("shift assignments", () => {
  const night = { ...DEFAULT_SHIFT, startTime: "22:00", endTime: "07:00" };
  it("rest-day override and night-shift override on a weekday", () => {
    const { rows } = computeDtr({
      ...base,
      today: "2026-10-09",
      days: ["2026-10-05", "2026-10-06", "2026-10-07"],
      assignments: new Map([["2026-10-05", null], ["2026-10-06", night]]),
      punches: [at("2026-10-06", "22:20"), at("2026-10-07", "07:00"), at("2026-10-07", "09:05"), at("2026-10-07", "18:00")],
    });
    expect(rows[0]).toMatchObject({ status: "REST_DAY", restDay: true });
    expect(rows[1]).toMatchObject({ status: "PRESENT", timeIn: "22:20", timeOut: "07:00", lateMinutes: 20, undertimeMinutes: 0, nightMinutes: 460, workedMinutes: 460 });
    // quick return: 07:00 out belongs to the night before, 09:05 starts the day shift
    expect(rows[2]).toMatchObject({ status: "PRESENT", timeIn: "09:05", timeOut: "18:00", restDay: false });
  });
  it("assigned shift on a weekend is a work day; unassigned weekend work is rest-day OT", () => {
    const { rows } = computeDtr({
      ...base,
      today: "2026-10-20",
      days: ["2026-10-10", "2026-10-11"],
      assignments: new Map([["2026-10-10", DEFAULT_SHIFT]]),
      punches: [at("2026-10-11", "10:00"), at("2026-10-11", "15:00")],
    });
    expect(rows[0]).toMatchObject({ status: "ABSENT", restDay: false });
    expect(rows[1]).toMatchObject({ status: "PRESENT", restDay: true, overtimeMinutes: 300 });
  });
  it("nightOverlap", () => {
    expect(nightOverlap(540, 1080)).toBe(0);
    expect(nightOverlap(1320, 1860)).toBe(480); // 22:00 -> 07:00
    expect(nightOverlap(-60, 120)).toBe(180); // 23:00 prev -> 02:00
  });
});

describe("rangeTotals", () => {
  it("splits paid/unpaid leave, half-day absence, holidays and rest days worked", () => {
    const { rows } = computeDtr({
      ...base,
      today: "2026-10-20",
      days: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"],
      holidays: new Map([["2026-10-09", "Holiday"]]),
      leaves: new Map([
        ["2026-10-06", { code: "VL", days: 1, paid: true }],
        ["2026-10-07", { code: "UL", days: 0.5, paid: false }],
      ]),
      punches: [at("2026-10-05", "09:30"), at("2026-10-05", "18:00"), at("2026-10-09", "09:00"), at("2026-10-09", "13:00"), at("2026-10-10", "22:00"), at("2026-10-11", "02:00")],
    });
    const t = rangeTotals(rows, [
      { date: "2026-10-09", type: "REGULAR" },
      { date: "2026-10-30", type: "SPECIAL_NON_WORKING" },
    ]);
    expect(t).toMatchObject({ workDays: 4, present: 1, absentDays: 1.5, paidLeaveDays: 1, unpaidLeaveDays: 0.5, lateMinutes: 30, workedMinutes: 450 + 240 + 240 });
    expect(t.holidays).toEqual([{ date: "2026-10-09", type: "REGULAR", workedMinutes: 240 }]);
    expect(t.restDaysWorked).toEqual([{ date: "2026-10-10", workedMinutes: 240 }]);
    expect(t.nightMinutes).toBe(240);
  });
});

describe("geofence", () => {
  const hq = { lat: 14.5547, lng: 121.0244, radius: 300 };
  it("haversine ~ Makati to Quezon City", () => {
    expect(haversineMeters({ lat: 14.5547, lng: 121.0244 }, { lat: 14.676, lng: 121.0437 }) / 1000).toBeCloseTo(13.6, 0);
  });
  it("inside, outside, accuracy tolerance capped", () => {
    expect(geofenceCheck({ lat: 14.5555, lng: 121.0244 }, hq).inside).toBe(true);
    const far = { lat: 14.5647, lng: 121.0244 }; // ~1.1 km north
    expect(geofenceCheck(far, hq).inside).toBe(false);
    expect(fmtDistance(geofenceCheck(far, hq).distance)).toBe("1.1 km");
    expect(geofenceCheck({ lat: 14.5580, lng: 121.0244, accuracy: 80 }, hq).inside).toBe(true); // ~367 m, 300 + 80
    expect(geofenceCheck({ ...far, accuracy: 5000 }, hq).inside).toBe(false);
  });
});
