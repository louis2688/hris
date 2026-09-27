import { describe, expect, it } from "vitest";
import { correctionPunchTimes, dailyRate, encashmentTaxSplit, outsideAvailability, parseAttendanceImport } from "./timeoff";

const day = { startTime: "09:00", endTime: "18:00" };
const night = { startTime: "22:00", endTime: "07:00" };

describe("correctionPunchTimes", () => {
  it("creates only the missing side", () => {
    expect(correctionPunchTimes({ kind: "MISSED_IN", date: "2026-09-01", inTime: "09:00", outTime: "18:00" }, day)).toEqual([{ date: "2026-09-01", time: "09:00", direction: "IN" }]);
    expect(correctionPunchTimes({ kind: "MISSED_OUT", date: "2026-09-01", outTime: "18:10" }, day)).toEqual([{ date: "2026-09-01", time: "18:10", direction: "OUT" }]);
  });
  it("moves a night shift out time to the next day", () => {
    expect(correctionPunchTimes({ kind: "MISSED_BOTH", date: "2026-09-30", inTime: "22:00", outTime: "07:00" }, night)).toEqual([
      { date: "2026-09-30", time: "22:00", direction: "IN" },
      { date: "2026-10-01", time: "07:00", direction: "OUT" },
    ]);
    expect(correctionPunchTimes({ kind: "MISSED_OUT", date: "2026-09-30", outTime: "06:30" }, night)[0]!.date).toBe("2026-10-01");
    expect(correctionPunchTimes({ kind: "MISSED_OUT", date: "2026-09-30", outTime: "23:30" }, night)[0]!.date).toBe("2026-09-30");
    expect(correctionPunchTimes({ kind: "WORK_FROM_HOME", date: "2026-09-30", inTime: "08:00", outTime: "17:00" }, day).map((p) => p.date)).toEqual(["2026-09-30", "2026-09-30"]);
  });
});

describe("parseAttendanceImport", () => {
  it("parses CSV by header, flags bad rows, rolls overnight outs", () => {
    const { format, rows } = parseAttendanceImport("employeeCode,date,time_in,time_out\nEMP-0005,2026-09-01,08:55,18:02\nEMP-0005,2026-09-02,22:00,06:10\nX,2026-13-01,08:00,\nEMP-0006,2026-09-01,8:5,\nEMP-0006,2026-09-03,,");
    expect(format).toBe("CSV");
    expect(rows[0]).toMatchObject({ line: 2, key: "EMP-0005", keyType: "employeeCode", punches: [{ date: "2026-09-01", time: "08:55", direction: "IN" }, { date: "2026-09-01", time: "18:02", direction: "OUT" }] });
    expect(rows[1]!.punches[1]).toMatchObject({ date: "2026-09-03", time: "06:10" });
    expect(rows[2]!.error).toMatch(/YYYY-MM-DD/);
    expect(rows[3]!.error).toMatch(/HH:mm/);
    expect(rows[4]!.error).toMatch(/No time/);
  });
  it("accepts biometricId columns and rejects a bad header", () => {
    expect(parseAttendanceImport("Biometric ID,Date,In,Out\n12,2026-09-01,9:00,18:00").rows[0]).toMatchObject({ keyType: "biometricId", key: "12", punches: [{ time: "09:00" }, { time: "18:00" }] });
    expect(parseAttendanceImport("name,when\nx,y").rows[0]!.error).toMatch(/Header/);
  });
  it("parses ZKTeco ATTLOG with seconds and line numbers", () => {
    const { format, rows } = parseAttendanceImport("12\t2026-09-01 08:55:31\t0\t1\t0\n\ngarbage\n12\t2026-09-01 18:01:02\t1\t15\t0");
    expect(format).toBe("ATTLOG");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ line: 1, key: "12", method: "FINGERPRINT", punches: [{ date: "2026-09-01", time: "08:55", sec: 31, direction: "IN" }] });
    expect(rows[1]).toMatchObject({ line: 3, error: "Not an ATTLOG line" });
    expect(rows[2]).toMatchObject({ line: 4, method: "FACE", punches: [{ direction: "OUT" }] });
  });
});

describe("encashment", () => {
  it("exempts up to 10 vacation days a year, the rest is taxable", () => {
    expect(encashmentTaxSplit(5, 0, true)).toEqual({ exempt: 5, taxable: 0 });
    expect(encashmentTaxSplit(5, 8, true)).toEqual({ exempt: 2, taxable: 3 });
    expect(encashmentTaxSplit(5, 12, true)).toEqual({ exempt: 0, taxable: 5 });
    expect(encashmentTaxSplit(5, 0, false)).toEqual({ exempt: 0, taxable: 5 });
  });
  it("daily rate", () => {
    expect(dailyRate("MONTHLY", 26100)).toBe(1200);
    expect(dailyRate("DAILY", 645)).toBe(645);
  });
});

describe("outsideAvailability", () => {
  it("checks the shift against the window", () => {
    expect(outsideAvailability(day, undefined)).toBe(false);
    expect(outsideAvailability(day, null)).toBe(true);
    expect(outsideAvailability(null, null)).toBe(false);
    expect(outsideAvailability(day, { fromTime: "08:00", toTime: "18:00" })).toBe(false);
    expect(outsideAvailability(day, { fromTime: "10:00", toTime: "18:00" })).toBe(true);
    expect(outsideAvailability(night, { fromTime: "20:00", toTime: "08:00" })).toBe(false);
    expect(outsideAvailability(night, { fromTime: "08:00", toTime: "20:00" })).toBe(true);
  });
});
