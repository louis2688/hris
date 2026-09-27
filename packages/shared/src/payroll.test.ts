import { describe, expect, it } from "vitest";
import type { DtrRangeTotals } from "./dtr";
import {
  DEFAULT_PAYROLL_CONFIG as cfg,
  computePayslip,
  computeThirteenthMonth,
  mergePayrollConfig,
  nextCutoff,
  nightOverlapMinutes,
  pagibigContribution,
  philhealthContribution,
  sssContribution,
  withholdingTax,
  type PayslipInput,
} from "./schemas/payroll";

const dtr = (o: Partial<DtrRangeTotals> = {}): DtrRangeTotals => ({
  workDays: 11, present: 11, absentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, lateMinutes: 0, undertimeMinutes: 0, workedMinutes: 0, nightMinutes: 0, holidays: [], restDaysWorked: [], ...o,
});
const input = (o: Partial<PayslipInput>): PayslipInput => ({
  payType: "MONTHLY", basicPay: 30000, allowance: 0, frequency: "SEMI_MONTHLY", half: 1, dtr: dtr(), workDays: [1, 2, 3, 4, 5], overtime: [], loans: [], expenses: [], config: cfg, ...o,
});
const line = (r: { lines: { code: string; amount: number }[] }, code: string) => r.lines.find((l) => l.code === code);

describe("contributions", () => {
  it("SSS MSC brackets, MPF and EC", () => {
    expect(sssContribution(4000, cfg.sss).msc).toBe(5000);
    expect(sssContribution(5249.99, cfg.sss).msc).toBe(5000);
    expect(sssContribution(5250, cfg.sss).msc).toBe(5500);
    expect(sssContribution(14749.99, cfg.sss)).toMatchObject({ msc: 14500, ec: 10 });
    expect(sssContribution(40000, cfg.sss)).toMatchObject({ msc: 35000, ee: 1750, er: 3500, ec: 30, eeMpf: 750, erMpf: 1500 });
  });
  it("PhilHealth floor/ceiling and 50/50 split", () => {
    expect(philhealthContribution(8000, cfg.philhealth)).toEqual({ total: 500, ee: 250, er: 250 });
    expect(philhealthContribution(30000, cfg.philhealth)).toEqual({ total: 1500, ee: 750, er: 750 });
    expect(philhealthContribution(150000, cfg.philhealth)).toEqual({ total: 5000, ee: 2500, er: 2500 });
  });
  it("Pag-IBIG low rate and P10,000 cap", () => {
    expect(pagibigContribution(1500, cfg.pagibig)).toEqual({ ee: 15, er: 30 });
    expect(pagibigContribution(1500.01, cfg.pagibig).ee).toBe(30);
    expect(pagibigContribution(50000, cfg.pagibig)).toEqual({ ee: 200, er: 200 });
  });
});

describe("withholding tax brackets", () => {
  it("semi-monthly boundaries", () => {
    expect(withholdingTax(10417, cfg.tax.semiMonthly)).toBe(0);
    expect(withholdingTax(10418, cfg.tax.semiMonthly)).toBe(0.15);
    expect(withholdingTax(16667, cfg.tax.semiMonthly)).toBe(937.5);
    expect(withholdingTax(16668, cfg.tax.semiMonthly)).toBe(937.7);
    expect(withholdingTax(33333, cfg.tax.semiMonthly)).toBeCloseTo(4270.7, 2);
  });
  it("monthly boundaries", () => {
    expect(withholdingTax(20833, cfg.tax.monthly)).toBe(0);
    expect(withholdingTax(33333, cfg.tax.monthly)).toBe(1875);
    expect(withholdingTax(66667, cfg.tax.monthly)).toBeCloseTo(8541.8, 2);
  });
});

describe("computePayslip", () => {
  it("monthly-paid with an absence and lates", () => {
    const r = computePayslip(input({ dtr: dtr({ absentDays: 1, lateMinutes: 30 }) }));
    expect(line(r, "BASIC")?.amount).toBe(15000);
    expect(line(r, "ABSENT")?.amount).toBe(-1379.31); // 30,000 x 12 / 261
    expect(line(r, "TARDY")?.amount).toBe(-86.21);
    expect(r.basicPay).toBe(13534.48);
    expect(r).toMatchObject({ grossPay: 13534.48, sss: 750, philhealth: 375, pagibig: 100, withholdingTax: 283.87, totalDeductions: 1508.87, netPay: 12025.61 });
    expect(line(r, "SSS_ER")?.amount).toBe(1500);
  });

  it("contribution halves add up to the monthly amount (odd centavo goes to 2nd half)", () => {
    const base = { payType: "DAILY" as const, basicPay: 695, dtr: dtr({ absentDays: 1 }) };
    const h1 = computePayslip(input({ ...base, half: 1 }));
    const h2 = computePayslip(input({ ...base, half: 2 }));
    expect(h2.basicPay).toBe(6950); // 10 paid days x 695
    expect(h1.philhealth + h2.philhealth).toBeCloseTo(377.91, 2);
    expect(h2).toMatchObject({ sss: 375, philhealth: 188.96, pagibig: 100, withholdingTax: 0, netPay: 6286.04 });
  });

  it("monthly frequency takes full contributions and uses the monthly tax table", () => {
    const r = computePayslip(input({ frequency: "MONTHLY", basicPay: 50000 }));
    expect(r).toMatchObject({ grossPay: 50000, sss: 1750, philhealth: 1250, pagibig: 200 });
    expect(r.withholdingTax).toBe(withholdingTax(50000 - 1750 - 1250 - 200, cfg.tax.monthly));
  });

  it("OT on a regular day + night differential (ND on OT at the OT rate, no double count)", () => {
    // 26,100 x 12 / 261 = 1,200/day = 2.50/min
    const r = computePayslip(
      input({
        basicPay: 26100,
        dtr: dtr({ nightMinutes: 180 }),
        overtime: [
          { date: "2025-03-04", minutes: 120, startTime: "18:00", endTime: "20:00" },
          { date: "2025-03-05", minutes: 120, startTime: "22:00", endTime: "00:00" },
        ],
      }),
    );
    expect(line(r, "OT_REGULAR_DAY")).toMatchObject({ amount: 750, qty: 4 }); // 240 min x 2.50 x 1.25
    expect(line(r, "NIGHTDIFF")?.amount).toBe(52.5); // 60 min x 2.50 x 10% + 120 x 2.50 x 1.25 x 10%
  });

  it("OT on a rest day uses 169%", () => {
    const r = computePayslip(input({ basicPay: 26100, overtime: [{ date: "2025-03-08", minutes: 60, startTime: "18:00", endTime: "19:00" }] }));
    expect(line(r, "OT_REST_DAY")?.amount).toBe(253.5); // 60 x 2.50 x 1.69
  });

  it("regular holiday worked: monthly-paid gets +100%, daily-paid gets 200%; unworked daily = 100%", () => {
    const hol = [
      { date: "2025-04-09", type: "REGULAR" as const, workedMinutes: 480 },
      { date: "2025-04-17", type: "REGULAR" as const, workedMinutes: 0 },
    ];
    const m = computePayslip(input({ basicPay: 26100, dtr: dtr({ holidays: hol }) }));
    expect(line(m, "HOLIDAY")?.amount).toBe(1200);
    const d = computePayslip(input({ payType: "DAILY", basicPay: 1000, dtr: dtr({ workDays: 9, holidays: hol }) }));
    expect(line(d, "HOLIDAY")?.amount).toBe(3000);
    expect(line(d, "BASIC")?.amount).toBe(9000);
  });

  it("special non-working worked = 130%, unworked daily = no pay; rest day worked = 130%", () => {
    const r = computePayslip(
      input({
        payType: "DAILY",
        basicPay: 1000,
        dtr: dtr({ workDays: 10, holidays: [{ date: "2025-08-21", type: "SPECIAL_NON_WORKING", workedMinutes: 480 }, { date: "2025-08-22", type: "SPECIAL_NON_WORKING", workedMinutes: 0 }], restDaysWorked: [{ date: "2025-08-23", workedMinutes: 600 }] }),
      }),
    );
    expect(line(r, "HOLIDAY")?.amount).toBe(1300);
    expect(line(r, "RESTDAY")?.amount).toBe(1300); // capped at 8h; the rest is OT via requests
  });

  it("loan deduction capped at balance; allowance and reimbursements are not taxed", () => {
    const r = computePayslip(
      input({
        allowance: 2000,
        loans: [{ id: "L1", label: "Cash advance", amortization: 2000, balance: 500 }],
        expenses: [{ id: "X1", label: "Taxi", amount: 1500 }],
      }),
    );
    expect(r.lines.find((l) => l.code === "LOAN")).toMatchObject({ amount: 500, ref: "L1" });
    expect(line(r, "ALLOWANCE")?.amount).toBe(1000);
    expect(r.grossPay).toBe(15000 + 1000 + 1500);
    expect(r.withholdingTax).toBe(withholdingTax(15000 - 750 - 375 - 100, cfg.tax.semiMonthly));
    expect(r.netPay).toBeCloseTo(r.grossPay - r.totalDeductions, 2);
  });

  it("loan never drives net pay negative", () => {
    const r = computePayslip(input({ basicPay: 10000, loans: [{ id: "L1", label: "Loan", amortization: 50000, balance: 50000 }] }));
    expect(r.netPay).toBe(0);
  });
});

describe("13th month", () => {
  it("basic YTD / 12, exempt under the ceiling", () => {
    expect(computeThirteenthMonth({ basicEarnedYtd: 360000, monthlyBasic: 30000, config: cfg })).toMatchObject({ grossPay: 30000, withholdingTax: 0, netPay: 30000 });
    expect(computeThirteenthMonth({ basicEarnedYtd: 120000, monthlyBasic: 20000, config: cfg }).grossPay).toBe(10000); // pro-rated new hire
  });
  it("excess over P90,000 is taxed at the marginal rate", () => {
    const r = computeThirteenthMonth({ basicEarnedYtd: 1200000, monthlyBasic: 100000, config: cfg });
    expect(r.lines.find((l) => l.code === "13TH_TAXABLE")?.amount).toBe(10000);
    expect(r).toMatchObject({ grossPay: 100000, withholdingTax: 2500, netPay: 97500 });
  });
});

describe("helpers", () => {
  it("night overlap", () => {
    expect(nightOverlapMinutes("18:00", "20:00")).toBe(0);
    expect(nightOverlapMinutes("21:00", "23:00")).toBe(60);
    expect(nightOverlapMinutes("22:00", "07:00")).toBe(480);
    expect(nightOverlapMinutes("04:00", "08:00")).toBe(120);
  });
  it("next cutoff", () => {
    expect(nextCutoff("SEMI_MONTHLY", "2026-09-15", cfg.schedule)).toMatchObject({ periodStart: "2026-09-16", periodEnd: "2026-09-30", payDate: "2026-09-30", half: 2 });
    expect(nextCutoff("SEMI_MONTHLY", "2026-12-31", cfg.schedule)).toMatchObject({ periodStart: "2027-01-01", periodEnd: "2027-01-15", payDate: "2027-01-15" });
    expect(nextCutoff("SEMI_MONTHLY", "2028-02-20", cfg.schedule, false)).toMatchObject({ periodStart: "2028-02-16", periodEnd: "2028-02-29" });
    expect(nextCutoff("MONTHLY", "2026-09-30", cfg.schedule)).toMatchObject({ periodStart: "2026-10-01", periodEnd: "2026-10-31" });
  });
  it("merges partial stored config over defaults", () => {
    const m = mergePayrollConfig({ sss: { eeRate: 0.06 } });
    expect(m.sss.eeRate).toBe(0.06);
    expect(m.sss.mscMax).toBe(35000);
    expect(m.tax.monthly.length).toBe(5);
  });
});

describe("settings form", () => {
  it("unflattens percent fields and JSON tax tables into a valid config", async () => {
    const { payrollConfigSchema, unflattenPayrollForm } = await import("./schemas/payroll");
    const flat: Record<string, unknown> = { daysPerYear: "261", hoursPerDay: "8", contributionTiming: "SPLIT", thirteenthMonthExempt: "90000" };
    for (const g of ["sss", "philhealth", "pagibig", "premiums", "schedule"] as const)
      for (const [k, v] of Object.entries(cfg[g])) flat[`${g}.${k}`] = typeof v === "number" && (g === "premiums" || ["eeRate", "erRate", "rate", "eeShare", "eeRateLow"].includes(k)) ? String(v * 100) : String(v);
    flat["tax.monthly"] = JSON.stringify(cfg.tax.monthly);
    flat["tax.semiMonthly"] = JSON.stringify(cfg.tax.semiMonthly);
    const r = payrollConfigSchema.safeParse(unflattenPayrollForm(flat));
    expect(r.success).toBe(true);
    expect(r.data).toEqual(cfg);
    flat["tax.monthly"] = "[{bad json";
    expect(payrollConfigSchema.safeParse(unflattenPayrollForm(flat)).success).toBe(false);
  });
});
