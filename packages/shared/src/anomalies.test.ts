import { describe, expect, it } from "vitest";
import { detectAnomalies, type AnomalyPunch } from "./anomalies";
import { computeDtr, DEFAULT_SHIFT, zonedToUtc } from "./dtr";

const TZ = "Asia/Manila";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"];
const rowsOf = (punches: Date[]) =>
  computeDtr({ days, punches, shift: DEFAULT_SHIFT, timeZone: TZ, holidays: new Map(), leaves: new Map(), today: "2026-10-13" }).rows;
const run = (rows: Map<string, ReturnType<typeof rowsOf>>, punches: AnomalyPunch[] = [], fences = new Map()) =>
  detectAnomalies({ rows, punches, fences, timeZone: TZ, today: "2026-10-13" });
const full = (d: string, i = "09:00", o = "18:00") => [at(d, i), at(d, o)];

describe("detectAnomalies", () => {
  it("flags repeated lates, missing out, long shift, absent streak across a weekend", () => {
    const a = rowsOf([...full("2026-10-05", "09:20"), ...full("2026-10-06", "09:15"), ...full("2026-10-07", "09:40"), at("2026-10-08", "09:00"), ...full("2026-10-09", "06:00", "21:30")]);
    const kinds = run(new Map([["a", a]])).map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(["REPEATED_LATE", "MISSING_OUT", "LONG_SHIFT"]));
    expect(kinds).not.toContain("ABSENT_STREAK"); // only Mon 12 absent

    const b = rowsOf([...full("2026-10-05"), ...full("2026-10-06"), ...full("2026-10-07"), ...full("2026-10-08")]); // absent Fri 9 + Mon 12
    const streak = run(new Map([["b", b]])).find((x) => x.kind === "ABSENT_STREAK");
    expect(streak).toMatchObject({ severity: "medium", dates: ["2026-10-09", "2026-10-12"] });
  });

  it("flags buddy punching on one terminal and from the same spot, not separate people minutes apart", () => {
    const p = (employeeId: string, time: string, extra: Partial<AnomalyPunch> = {}): AnomalyPunch => ({ employeeId, at: at("2026-10-05", time), device: null, latitude: null, longitude: null, hasPhoto: false, ...extra });
    const punches = [
      p("a", "08:55", { device: "Lobby" }),
      p("b", "08:55", { device: "Lobby", at: new Date(at("2026-10-05", "08:55").getTime() + 20_000) }),
      p("c", "09:10", { device: "Lobby" }),
      p("d", "09:30", { latitude: 14.5547, longitude: 121.0244 }),
      p("e", "09:30", { latitude: 14.55471, longitude: 121.02441 }),
      p("f", "09:30", { latitude: 14.55471, longitude: 121.02441, hasPhoto: true }),
    ];
    const buddy = run(new Map(), punches).filter((x) => x.kind === "BUDDY_PUNCH");
    expect(buddy.map((x) => x.employeeIds.sort())).toEqual([["a", "b"], ["d", "e"]]);
  });

  it("flags punches outside the geofence", () => {
    const fences = new Map([["a", { name: "Manila HQ", lat: 14.5547, lng: 121.0244, radius: 300 }]]);
    const punches: AnomalyPunch[] = [
      { employeeId: "a", at: at("2026-10-05", "09:00"), device: null, latitude: 14.5549, longitude: 121.0244, hasPhoto: true },
      { employeeId: "a", at: at("2026-10-06", "09:00"), device: null, latitude: 14.6547, longitude: 121.0244, hasPhoto: true },
    ];
    const [g] = run(new Map(), punches, fences);
    expect(g).toMatchObject({ kind: "OUTSIDE_GEOFENCE", dates: ["2026-10-06"], severity: "high" });
    expect(g!.evidence).toContain("11.1 km");
  });
});
