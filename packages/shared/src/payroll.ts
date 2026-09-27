/**
 * Philippine payroll maths. Pure, no DB. All money is computed in integer centavos and
 * returned in pesos rounded to 2 decimals. Rates live in PayrollConfig (AppSetting "payroll")
 * so HR can update them in Settings > Payroll without a deploy.
 */
import type { DtrRangeTotals } from "./dtr";
import { LOAN_TYPE_LABELS } from "./constants";

export type TaxBracket = { over: number; base: number; rate: number };

export interface PayrollConfig {
  /**
   * SSS, RA 11199 schedule, final step effective Jan 2025 (SSS Circular 2024-006), unchanged for 2026.
   * 15% of MSC: EE 5%, ER 10%. MSC P5,000-P35,000 in P500 steps. Regular SS on MSC up to P20,000,
   * the excess goes to the MPF (WISP). EC (ER only): P10 below MSC P15,000, else P30.
   * https://www.sss.gov.ph/wp-content/uploads/2024/12/Cir-2024-006-Employers-Contribution-Schedule.pdf
   */
  sss: { eeRate: number; erRate: number; mscMin: number; mscMax: number; mscStep: number; regularMscMax: number; ecLow: number; ecHigh: number; ecThreshold: number };
  /**
   * PhilHealth, RA 11223 (UHC Act): 5% of monthly basic salary, floor P10,000, ceiling P100,000, split 50/50.
   * PhilHealth Circular 2020-0005 schedule; 5% has held since 2024 (2026 unchanged).
   * https://www.philhealth.gov.ph/advisories/2024/PA2024-0002.pdf
   */
  philhealth: { rate: number; floor: number; ceiling: number; eeShare: number };
  /**
   * Pag-IBIG (HDMF) Circular 460 (effective Feb 2024): EE 1% if monthly comp <= P1,500 else 2%,
   * ER 2%, on a max fund salary of P10,000 (P200 EE / P200 ER cap).
   * https://www.pagibigfund.gov.ph/document/pdf/circulars/provident/HDMF%20Circular%20No.%20460%20-%20Revised%20Guidelines%20on%20Membership%20Contributions.pdf
   */
  pagibig: { eeRateLow: number; lowThreshold: number; eeRate: number; erRate: number; maxFundSalary: number };
  /**
   * BIR withholding on compensation, RR 11-2018 Annex E, table effective Jan 1, 2023 onwards (TRAIN, RA 10963).
   * tax = base + rate x (taxable - over), using the highest bracket with taxable > over.
   * https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf
   */
  tax: { semiMonthly: TaxBracket[]; monthly: TaxBracket[] };
  /**
   * Labor Code arts. 87, 93, 94, 86 and DOLE Handbook on Workers' Statutory Monetary Benefits.
   * Multipliers of the daily/hourly rate. Night differential is +10% of the applicable rate, 10pm-6am.
   * https://bwc.dole.gov.ph/images/Downloads/2024%20Handbook%20on%20Workers%20Statutory%20Monetary%20Benefits.pdf
   */
  premiums: {
    overtime: number; // regular day OT 125%
    restDay: number; // rest day or special day worked 130%
    restDayOt: number; // 169%
    specialHoliday: number; // special non-working worked 130%
    specialHolidayOt: number; // 169%
    specialHolidayRestDay: number; // special on rest day 150%
    specialHolidayRestDayOt: number; // 195%
    regularHoliday: number; // worked 200%
    regularHolidayOt: number; // 260%
    regularHolidayRestDay: number; // 260%
    regularHolidayRestDayOt: number; // 338%
    nightDiff: number; // 0.10
  };
  /** Days per year used for the daily rate of monthly-paid staff: 261 (5-day week) or 313 (6-day week). */
  daysPerYear: number;
  hoursPerDay: number;
  /** SPLIT: half of each monthly contribution per semi-monthly cutoff. SECOND_HALF: full amount on the 16th-end cutoff. */
  contributionTiming: "SPLIT" | "SECOND_HALF";
  /** 13th month + other benefits exempt up to this (NIRC sec. 32(B)(7)(e) as amended by TRAIN). */
  thirteenthMonthExempt: number;
  /** Pay days: day of month for the 1st-15th and 16th-end cutoffs (0 = last day of month). */
  schedule: { frequency: "SEMI_MONTHLY" | "MONTHLY"; firstPayDay: number; secondPayDay: number };
  /**
   * Withholding on off-cycle runs (bonuses paid outside cutoffs).
   * TABLE: the monthly table applied on top of the employee's monthly basic, tax(basic + amount) - tax(basic),
   * so the amount is taxed at the employee's own marginal bracket (same method as the 13th-month excess).
   * FLAT: taxable amount x flatRate.
   */
  offCycleTax: { method: "TABLE" | "FLAT"; flatRate: number };
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  sss: { eeRate: 0.05, erRate: 0.1, mscMin: 5000, mscMax: 35000, mscStep: 500, regularMscMax: 20000, ecLow: 10, ecHigh: 30, ecThreshold: 15000 },
  philhealth: { rate: 0.05, floor: 10000, ceiling: 100000, eeShare: 0.5 },
  pagibig: { eeRateLow: 0.01, lowThreshold: 1500, eeRate: 0.02, erRate: 0.02, maxFundSalary: 10000 },
  tax: {
    semiMonthly: [
      { over: 10417, base: 0, rate: 0.15 },
      { over: 16667, base: 937.5, rate: 0.2 },
      { over: 33333, base: 4270.7, rate: 0.25 },
      { over: 83333, base: 16770.7, rate: 0.3 },
      { over: 333333, base: 91770.7, rate: 0.35 },
    ],
    monthly: [
      { over: 20833, base: 0, rate: 0.15 },
      { over: 33333, base: 1875, rate: 0.2 },
      { over: 66667, base: 8541.8, rate: 0.25 },
      { over: 166667, base: 33541.8, rate: 0.3 },
      { over: 666667, base: 183541.8, rate: 0.35 },
    ],
  },
  premiums: {
    overtime: 1.25,
    restDay: 1.3,
    restDayOt: 1.69,
    specialHoliday: 1.3,
    specialHolidayOt: 1.69,
    specialHolidayRestDay: 1.5,
    specialHolidayRestDayOt: 1.95,
    regularHoliday: 2,
    regularHolidayOt: 2.6,
    regularHolidayRestDay: 2.6,
    regularHolidayRestDayOt: 3.38,
    nightDiff: 0.1,
  },
  daysPerYear: 261,
  hoursPerDay: 8,
  contributionTiming: "SPLIT",
  thirteenthMonthExempt: 90000,
  schedule: { frequency: "SEMI_MONTHLY", firstPayDay: 15, secondPayDay: 0 },
  offCycleTax: { method: "TABLE", flatRate: 0.2 },
};

/** Stored config merged over defaults group by group (a partial or older stored value never drops a rate). */
export function mergePayrollConfig(stored: unknown): PayrollConfig {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<PayrollConfig>;
  const D = DEFAULT_PAYROLL_CONFIG;
  return {
    ...D,
    ...s,
    sss: { ...D.sss, ...s.sss },
    philhealth: { ...D.philhealth, ...s.philhealth },
    pagibig: { ...D.pagibig, ...s.pagibig },
    tax: { ...D.tax, ...s.tax },
    premiums: { ...D.premiums, ...s.premiums },
    schedule: { ...D.schedule, ...s.schedule },
    offCycleTax: { ...D.offCycleTax, ...s.offCycleTax },
  };
}

// ---------- Money helpers (centavos) ----------

const C = (pesos: number) => Math.round(pesos * 100);
const P = (centavos: number) => Math.round(centavos) / 100;

// ---------- Contributions (monthly amounts, pesos) ----------

export function sssContribution(monthlyComp: number, c: PayrollConfig["sss"]) {
  const steps = Math.floor((monthlyComp - c.mscMin + c.mscStep / 2) / c.mscStep);
  const msc = Math.min(c.mscMax, Math.max(c.mscMin, c.mscMin + c.mscStep * steps));
  const regular = Math.min(msc, c.regularMscMax);
  const mpf = msc - regular;
  return {
    msc,
    ee: P(C(msc * c.eeRate)),
    er: P(C(msc * c.erRate)),
    ec: msc < c.ecThreshold ? c.ecLow : c.ecHigh,
    eeMpf: P(C(mpf * c.eeRate)),
    erMpf: P(C(mpf * c.erRate)),
  };
}

export function philhealthContribution(monthlyBasic: number, c: PayrollConfig["philhealth"]) {
  const total = C(Math.min(c.ceiling, Math.max(c.floor, monthlyBasic)) * c.rate);
  const ee = Math.round(total * c.eeShare);
  return { total: P(total), ee: P(ee), er: P(total - ee) };
}

export function pagibigContribution(monthlyComp: number, c: PayrollConfig["pagibig"]) {
  const base = Math.min(monthlyComp, c.maxFundSalary);
  return { ee: P(C(base * (monthlyComp <= c.lowThreshold ? c.eeRateLow : c.eeRate))), er: P(C(base * c.erRate)) };
}

export function withholdingTax(taxable: number, brackets: TaxBracket[]): number {
  const b = [...brackets].sort((x, y) => y.over - x.over).find((x) => taxable > x.over);
  return b ? P(C(b.base + (taxable - b.over) * b.rate)) : 0;
}

// ---------- Payslip ----------

export type PayslipLine = {
  /** info: shown but not part of gross/deductions (e.g. amount due from a leaver) */
  kind: "earning" | "deduction" | "employer" | "info";
  code: string;
  label: string;
  amount: number;
  qty?: number;
  /** Loan id / expense claim id / benefit enrollment id / asset id this line settles */
  ref?: string;
  /** PayrollAdjustment paid by this line (one-offs are marked applied on finalize) */
  adjustmentId?: string;
  /** Earning excluded from taxable income */
  nonTaxable?: true;
  /** Deduction that reduces taxable income */
  preTax?: true;
};

/** Earnings/deductions picked up by payroll. taxable: an earning is taxed; a deduction reduces taxable income. */
export type AdjustmentInput = { id?: string; kind: "EARNING" | "DEDUCTION"; code: string; label: string; amount: number; taxable: boolean; qty?: number; ref?: string };

export type TaxMethod =
  | { kind: "PERIOD" }
  /** Off-cycle: marginal monthly table over monthly basic */
  | { kind: "MARGINAL"; monthlyBasic: number }
  | { kind: "FLAT"; rate: number }
  /** Final pay: annual table on YTD + this payslip, minus tax already withheld (may refund) */
  | { kind: "ANNUALIZED"; ytdTaxable: number; ytdWithheld: number };

export interface PayslipInput {
  payType: "MONTHLY" | "DAILY";
  /** Monthly salary (MONTHLY) or daily rate (DAILY) */
  basicPay: number;
  /** Monthly non-taxable de minimis allowance */
  allowance: number;
  frequency: "SEMI_MONTHLY" | "MONTHLY";
  /** Semi-monthly cutoff: 1 = 1st-15th, 2 = 16th-end. Ignored for MONTHLY. */
  half: 1 | 2;
  dtr: DtrRangeTotals;
  /** Shift work weekdays (0 = Sun), used to classify OT on rest days */
  workDays: number[];
  /** Approved OT in the period */
  overtime: { date: string; minutes: number; startTime: string; endTime: string }[];
  loans: { id: string; label: string; amortization: number; balance: number }[];
  expenses: { id: string; label: string; amount: number }[];
  config: PayrollConfig;
  adjustments?: AdjustmentInput[];
  /** Active benefit enrollments: monthly employee share, split per cutoff like contributions (code HMO_EE) */
  benefits?: { id: string; label: string; monthly: number }[];
  /** Monthly-paid basic = daily rate x paid days in the period instead of half/full month (final pay, off-cycle) */
  partial?: boolean;
  noContributions?: boolean;
  /** Final pay: loans are deducted at their full balance and nothing is capped; a shortfall becomes AMOUNT_DUE */
  settle?: boolean;
  tax?: TaxMethod;
}

export interface PayslipResult {
  lines: PayslipLine[];
  /** Basic pay earned in the period, after absences/tardiness (13th month base) */
  basicPay: number;
  grossPay: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  withholdingTax: number;
  totalDeductions: number;
  netPay: number;
  /** Deductions above gross (final pay only); net pay is then 0 */
  amountDue?: number;
}

const hhmm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Minutes of [start, end) (HH:mm, end <= start crosses midnight) inside 22:00-06:00. */
export function nightOverlapMinutes(startTime: string, endTime: string): number {
  const s = hhmm(startTime);
  let e = hhmm(endTime);
  if (e <= s) e += 1440;
  const windows = [[-120, 360], [1320, 1800]] as const; // 00:00-06:00, then 22:00-06:00 next day
  return windows.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(e, b) - Math.max(s, a)), 0);
}

type DayKind = "REGULAR_DAY" | "REST_DAY" | "SPECIAL" | "SPECIAL_REST" | "REGULAR_HOLIDAY" | "REGULAR_HOLIDAY_REST";

const DAY_LABEL: Record<DayKind, string> = {
  REGULAR_DAY: "Overtime",
  REST_DAY: "Rest day OT",
  SPECIAL: "Special holiday OT",
  SPECIAL_REST: "Special holiday + rest day OT",
  REGULAR_HOLIDAY: "Regular holiday OT",
  REGULAR_HOLIDAY_REST: "Regular holiday + rest day OT",
};

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

function dayKind(date: string, dtr: DtrRangeTotals, workDays: number[]): DayKind {
  const rest = dtr.restDaysWorked.some((r) => r.date === date) || !workDays.includes(weekday(date));
  const h = dtr.holidays.find((x) => x.date === date && x.type !== "SPECIAL_WORKING");
  if (h?.type === "REGULAR") return rest ? "REGULAR_HOLIDAY_REST" : "REGULAR_HOLIDAY";
  if (h?.type === "SPECIAL_NON_WORKING") return rest ? "SPECIAL_REST" : "SPECIAL";
  return rest ? "REST_DAY" : "REGULAR_DAY";
}

function multipliers(kind: DayKind, p: PayrollConfig["premiums"]): { day: number; ot: number } {
  switch (kind) {
    case "REGULAR_DAY": return { day: 1, ot: p.overtime };
    case "REST_DAY": return { day: p.restDay, ot: p.restDayOt };
    case "SPECIAL": return { day: p.specialHoliday, ot: p.specialHolidayOt };
    case "SPECIAL_REST": return { day: p.specialHolidayRestDay, ot: p.specialHolidayRestDayOt };
    case "REGULAR_HOLIDAY": return { day: p.regularHoliday, ot: p.regularHolidayOt };
    case "REGULAR_HOLIDAY_REST": return { day: p.regularHolidayRestDay, ot: p.regularHolidayRestDayOt };
  }
}

const hrs = (min: number) => Math.round((min / 60) * 100) / 100;

/** Daily rate: the daily rate itself, or monthly x 12 / days-per-year for monthly-paid. */
export const dailyRateOf = (payType: "MONTHLY" | "DAILY", basicPay: number, cfg: PayrollConfig) => (payType === "DAILY" ? basicPay : P(C((basicPay * 12) / cfg.daysPerYear)));
export const monthlyBasicOf = (payType: "MONTHLY" | "DAILY", basicPay: number, cfg: PayrollConfig) => (payType === "DAILY" ? (basicPay * cfg.daysPerYear) / 12 : basicPay);

/** Annual table = monthly table x 12 (RR 11-2018 annual table, within a few pesos of rounding). */
export const annualTax = (taxable: number, cfg: PayrollConfig) => withholdingTax(taxable, cfg.tax.monthly.map((b) => ({ over: b.over * 12, base: b.base * 12, rate: b.rate })));

/** DTR totals of an empty period (off-cycle runs, final pay after the last full cutoff). */
export const EMPTY_DTR: DtrRangeTotals = { workDays: 0, present: 0, absentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, lateMinutes: 0, undertimeMinutes: 0, workedMinutes: 0, nightMinutes: 0, holidays: [], restDaysWorked: [] };

export function computePayslip(i: PayslipInput): PayslipResult {
  const cfg = i.config;
  const semi = i.frequency === "SEMI_MONTHLY";
  const dayMin = cfg.hoursPerDay * 60;
  // Daily rate in centavos; monthly-paid: monthly x 12 / days-per-year.
  const dailyC = i.payType === "DAILY" ? C(i.basicPay) : C((i.basicPay * 12) / cfg.daysPerYear);
  const minuteC = dailyC / dayMin;
  const monthlyBasic = monthlyBasicOf(i.payType, i.basicPay, cfg);
  const d = i.dtr;

  const earn: PayslipLine[] = [];
  const add = (code: string, label: string, centavos: number, qty?: number, taxable = true) => {
    if (Math.round(centavos) === 0) return 0;
    earn.push({ kind: "earning", code, label, amount: P(centavos), ...(qty !== undefined ? { qty } : {}), ...(taxable ? {} : { nonTaxable: true as const }) });
    return taxable ? Math.round(centavos) : 0;
  };

  let basicC: number;
  let taxableC = 0;
  let paidDays: number; // days actually paid, for the pro-rated allowance of a partial period
  if (i.payType === "MONTHLY") {
    // Partial period: the 261/313 factor pays scheduled days and the holidays that fall on them.
    paidDays = d.workDays + d.holidays.filter((h) => h.type !== "SPECIAL_WORKING" && i.workDays.includes(weekday(h.date))).length;
    basicC = i.partial ? dailyC * paidDays : C(semi ? i.basicPay / 2 : i.basicPay);
    taxableC += add("BASIC", "Basic pay", basicC, i.partial ? paidDays : undefined);
    paidDays -= d.absentDays + d.unpaidLeaveDays;
  } else {
    const days = Math.max(0, d.workDays - d.absentDays - d.unpaidLeaveDays);
    basicC = dailyC * days;
    paidDays = days;
    taxableC += add("BASIC", "Basic pay", basicC, days);
  }

  // Absences, unpaid leave and tardiness reduce basic. Daily-paid absences are simply unpaid days (already excluded).
  if (i.payType === "MONTHLY") {
    const absent = d.absentDays + d.unpaidLeaveDays;
    const absC = -dailyC * absent;
    basicC += absC;
    taxableC += add("ABSENT", "Absences / unpaid leave", absC, absent);
  }
  const tardyMin = d.lateMinutes + d.undertimeMinutes;
  const tardyC = -Math.round(minuteC * tardyMin);
  basicC += tardyC;
  taxableC += add("TARDY", "Late / undertime", tardyC, hrs(tardyMin));

  // Holidays: worked premium for the first 8h (OT hours come from approved OT requests).
  let holidayC = 0;
  for (const h of d.holidays) {
    if (h.type === "SPECIAL_WORKING") continue; // ordinary working day
    const kind = dayKind(h.date, d, i.workDays);
    const m = multipliers(kind, cfg.premiums).day;
    const worked = Math.min(h.workedMinutes, dayMin);
    // Monthly salary (261/313 factor) already pays holidays at 100%, so monthly-paid get only the premium on top.
    // Daily-paid: regular holiday unworked = 100% (even on a rest day), worked = full multiplier; special unworked = no work no pay.
    const already = i.payType === "MONTHLY" && !kind.endsWith("REST") ? 1 : 0;
    const unworkedPay = i.payType === "DAILY" && h.type === "REGULAR" ? 1 : 0;
    holidayC += Math.round(minuteC * worked * (m - already)) + Math.round(dailyC * unworkedPay * (1 - worked / dayMin));
  }
  taxableC += add("HOLIDAY", "Holiday pay / premium", holidayC, d.holidays.filter((h) => h.type !== "SPECIAL_WORKING").length);

  let restC = 0;
  let restMin = 0;
  for (const r of d.restDaysWorked) {
    if (d.holidays.some((h) => h.date === r.date && h.type !== "SPECIAL_WORKING")) continue; // paid in the holiday loop
    const worked = Math.min(r.workedMinutes, dayMin);
    restMin += worked;
    restC += Math.round(minuteC * worked * cfg.premiums.restDay);
  }
  taxableC += add("RESTDAY", "Rest day work", restC, hrs(restMin));

  // Approved OT, grouped by day type. Night minutes inside OT get ND on the OT rate.
  const ot = new Map<DayKind, { min: number; c: number; nightMin: number; nightC: number }>();
  let otNightTotal = 0;
  for (const o of i.overtime) {
    const kind = dayKind(o.date, d, i.workDays);
    const m = multipliers(kind, cfg.premiums).ot;
    const night = Math.min(o.minutes, nightOverlapMinutes(o.startTime, o.endTime));
    otNightTotal += night;
    const g = ot.get(kind) ?? { min: 0, c: 0, nightMin: 0, nightC: 0 };
    g.min += o.minutes;
    g.c += Math.round(minuteC * o.minutes * m);
    g.nightMin += night;
    g.nightC += Math.round(minuteC * night * m * cfg.premiums.nightDiff);
    ot.set(kind, g);
  }
  let otNightC = 0;
  for (const [kind, g] of ot) {
    taxableC += add(`OT_${kind}`, DAY_LABEL[kind], g.c, hrs(g.min));
    otNightC += g.nightC;
  }
  // ponytail: DTR night minutes include punched OT; subtract the OT night minutes so ND is not paid twice.
  const ndMin = Math.max(0, d.nightMinutes - otNightTotal);
  const ndC = Math.round(minuteC * ndMin * cfg.premiums.nightDiff) + otNightC;
  taxableC += add("NIGHTDIFF", "Night differential", ndC, hrs(ndMin + otNightTotal));

  // Adjustments (bonus, arrears, leave encashment, referral bonus, 13th month on final pay...)
  const adjDeductions: AdjustmentInput[] = [];
  for (const a of i.adjustments ?? []) {
    if (a.kind === "DEDUCTION") {
      adjDeductions.push(a);
      continue;
    }
    const c = C(a.amount);
    if (c <= 0) continue;
    earn.push({ kind: "earning", code: a.code, label: a.label, amount: P(c), ...(a.qty !== undefined ? { qty: a.qty } : {}), ...(a.ref ? { ref: a.ref } : {}), ...(a.id ? { adjustmentId: a.id } : {}), ...(a.taxable ? {} : { nonTaxable: true as const }) });
    if (a.taxable) taxableC += c;
  }

  // Non-taxable
  // Partial period: monthly allowance x 12 / days-per-year for each paid day.
  add("ALLOWANCE", "De minimis allowance", i.partial ? Math.round(C((i.allowance * 12) / cfg.daysPerYear) * Math.max(0, paidDays)) : C(semi ? i.allowance / 2 : i.allowance), undefined, false);
  for (const e of i.expenses) {
    earn.push({ kind: "earning", code: "REIMBURSE", label: e.label, amount: P(C(e.amount)), ref: e.id, nonTaxable: true });
  }

  let grossC = earn.reduce((s, l) => s + C(l.amount), 0);

  // Contributions: monthly amounts, split per cutoff.
  const sss = sssContribution(monthlyBasic, cfg.sss);
  const ph = philhealthContribution(monthlyBasic, cfg.philhealth);
  const hdmf = pagibigContribution(monthlyBasic, cfg.pagibig);
  const split = (t: number) => {
    if (!semi) return t;
    if (cfg.contributionTiming === "SECOND_HALF") return i.half === 2 ? t : 0;
    const first = Math.floor(t / 2);
    return i.half === 1 ? first : t - first;
  };
  const share = (monthlyPesos: number) => split(i.noContributions ? 0 : C(monthlyPesos));
  const sssC = share(sss.ee);
  const phC = share(ph.ee);
  const hdmfC = share(hdmf.ee);
  const contribC = sssC + phC + hdmfC;

  const method = i.tax ?? { kind: "PERIOD" };
  /** Tax due (centavos) on taxable income t; negative only for an annualized refund. */
  const taxOn = (t: number): number => {
    const tp = P(Math.max(0, t));
    switch (method.kind) {
      case "PERIOD": return C(withholdingTax(tp, semi ? cfg.tax.semiMonthly : cfg.tax.monthly));
      case "FLAT": return Math.round(C(tp) * method.rate);
      case "MARGINAL": return C(withholdingTax(method.monthlyBasic + tp, cfg.tax.monthly)) - C(withholdingTax(method.monthlyBasic, cfg.tax.monthly));
      case "ANNUALIZED": return C(annualTax(method.ytdTaxable + tp, cfg)) - C(method.ytdWithheld);
    }
  };

  const ded: PayslipLine[] = [];
  const deduct = (code: string, label: string, c: number, extra: Partial<PayslipLine> = {}) => {
    if (c > 0) ded.push({ kind: "deduction", code, label, amount: P(c), ...extra });
  };

  // Adjustment deductions apply whole or not at all (a skipped one-off stays pending for the next run). The fit test
  // uses the tax before pre-tax deductions, the highest it can be, so an accepted one still fits once tax drops.
  let leftC = grossC - contribC - Math.max(0, taxOn(taxableC - contribC));
  const benefitC = (i.benefits ?? []).map((b) => {
    const c = i.settle ? split(C(b.monthly)) : Math.max(0, Math.min(split(C(b.monthly)), leftC));
    leftC -= c;
    return c;
  });
  const accepted = adjDeductions.filter((a) => {
    const c = C(a.amount);
    if (c <= 0 || (!i.settle && c > leftC)) return false;
    leftC -= c;
    return true;
  });
  const preTaxC = accepted.filter((a) => a.taxable).reduce((s, a) => s + C(a.amount), 0);

  const taxDueC = taxOn(taxableC - contribC - preTaxC);
  const taxC = Math.max(0, taxDueC);
  if (taxDueC < 0) {
    earn.push({ kind: "earning", code: "TAX_REFUND", label: "Tax refund (annualization)", amount: P(-taxDueC), nonTaxable: true });
    grossC -= taxDueC;
  }

  deduct("SSS", sss.eeMpf > 0 ? "SSS (incl. MPF)" : "SSS", sssC);
  deduct("PHILHEALTH", "PhilHealth", phC);
  deduct("PAGIBIG", "Pag-IBIG", hdmfC);
  deduct("TAX", "Withholding tax", taxC);
  (i.benefits ?? []).forEach((b, k) => deduct("HMO_EE", b.label, benefitC[k]!, { ref: b.id }));
  for (const a of accepted) deduct(a.code, a.label, C(a.amount), { ...(a.id ? { adjustmentId: a.id } : {}), ...(a.ref ? { ref: a.ref } : {}), ...(a.qty !== undefined ? { qty: a.qty } : {}), ...(a.taxable ? { preTax: true as const } : {}) });

  // Loans last. Regular runs: amortization capped at balance and at what is left so net pay never goes negative.
  // Final pay (settle): the full balance.
  leftC = grossC - ded.reduce((s, l) => s + C(l.amount), 0);
  for (const l of i.loans) {
    const c = i.settle ? C(l.balance) : Math.max(0, Math.min(C(l.amortization), C(l.balance), leftC));
    leftC -= c;
    deduct("LOAN", l.label, c, { ref: l.id });
  }

  const employer: PayslipLine[] = [
    { kind: "employer", code: "SSS_ER", label: "SSS employer share", amount: P(share(sss.er)) },
    { kind: "employer", code: "SSS_EC", label: "SSS EC", amount: P(share(sss.ec)) },
    { kind: "employer", code: "PHILHEALTH_ER", label: "PhilHealth employer share", amount: P(share(ph.er)) },
    { kind: "employer", code: "PAGIBIG_ER", label: "Pag-IBIG employer share", amount: P(share(hdmf.er)) },
  ].filter((l) => l.amount > 0) as PayslipLine[];

  const totalDedC = ded.reduce((s, l) => s + C(l.amount), 0);
  const netC = grossC - totalDedC;
  const info: PayslipLine[] = netC < 0 ? [{ kind: "info", code: "AMOUNT_DUE", label: "Amount due from employee", amount: P(-netC) }] : [];
  return {
    lines: [...earn, ...ded, ...employer, ...info],
    basicPay: P(basicC),
    grossPay: P(grossC),
    sss: P(sssC),
    philhealth: P(phC),
    pagibig: P(hdmfC),
    withholdingTax: P(taxC),
    totalDeductions: P(totalDedC),
    netPay: P(Math.max(0, netC)),
    ...(netC < 0 ? { amountDue: P(-netC) } : {}),
  };
}

/** Taxable compensation of a stored payslip: taxed earnings less contributions and pre-tax deductions (annualization input). */
export function slipTaxableIncome(lines: PayslipLine[]): number {
  const legacyNonTaxable = new Set(["ALLOWANCE", "REIMBURSE", "13TH", "TAX_REFUND"]);
  let c = 0;
  for (const l of lines) {
    if (l.kind === "earning" && !l.nonTaxable && !legacyNonTaxable.has(l.code)) c += C(l.amount);
    if (l.kind === "deduction" && (l.preTax || ["SSS", "PHILHEALTH", "PAGIBIG"].includes(l.code))) c -= C(l.amount);
  }
  return P(Math.max(0, c));
}

// ---------- Off-cycle and final pay ----------

/** Off-cycle run: adjustments only (no basic, DTR, contributions or loans), taxed per config.offCycleTax. */
export function computeOffCycle(i: { adjustments: AdjustmentInput[]; payType: "MONTHLY" | "DAILY"; basicPay: number; config: PayrollConfig }): PayslipResult {
  const cfg = i.config;
  return computePayslip({
    payType: i.payType,
    basicPay: i.basicPay,
    allowance: 0,
    frequency: "MONTHLY",
    half: 2,
    dtr: EMPTY_DTR,
    workDays: [],
    overtime: [],
    loans: [],
    expenses: [],
    config: cfg,
    adjustments: i.adjustments,
    partial: true,
    noContributions: true,
    tax: cfg.offCycleTax.method === "FLAT" ? { kind: "FLAT", rate: cfg.offCycleTax.flatRate } : { kind: "MARGINAL", monthlyBasic: monthlyBasicOf(i.payType, i.basicPay, cfg) },
  });
}

/** Monetized unused leave up to this many days a year is de minimis (RR 11-2018); the rest is taxable. */
export const LEAVE_ENCASH_EXEMPT_DAYS = 10;

export interface FinalPayInput extends PayslipInput {
  /** Totals of this calendar year's finalized payslips before the final pay */
  ytd: { basicEarned: number; thirteenthPaid: number; taxable: number; withheld: number };
  encashDays: number;
  /** Unreturned assets to deduct at cost */
  assets: { id: string; label: string; amount: number }[];
}

/**
 * Final pay (DOLE Labor Advisory 06-2020): pro-rated basic from the day after the last regular cutoff to the last day
 * (DTR based, daily rate x paid days), approved OT, pending adjustments and reimbursements, pro-rated 13th month
 * ((basic earned this year incl. this period) / 12 - 13th month already paid), leave encashment (days x daily rate),
 * minus every remaining loan balance and optionally unreturned assets.
 * Tax, "annualized-lite": annual table (monthly x 12) on YTD taxable + this payslip's taxable, minus YTD withheld;
 * a negative result is refunded. YTD taxable comes from stored payslip lines (slipTaxableIncome), so it ignores
 * compensation from a previous employer (BIR 2316) and non-payroll benefits.
 * Net pay never goes negative: a shortfall is reported as AMOUNT_DUE from the employee.
 */
export function computeFinalPay(i: FinalPayInput): PayslipResult {
  const cfg = i.config;
  const base: PayslipInput = { ...i, partial: true, settle: true, tax: { kind: "ANNUALIZED", ytdTaxable: i.ytd.taxable, ytdWithheld: i.ytd.withheld } };
  const periodBasic = computePayslip(base).basicPay;

  const extra: AdjustmentInput[] = [];
  const thirteenthC = Math.max(0, Math.round(C(i.ytd.basicEarned + periodBasic) / 12) - C(i.ytd.thirteenthPaid));
  const exemptC = Math.min(thirteenthC, Math.max(0, C(cfg.thirteenthMonthExempt) - C(i.ytd.thirteenthPaid)));
  extra.push({ kind: "EARNING", code: "13TH", label: "13th month pay (pro-rated)", amount: P(exemptC), taxable: false });
  extra.push({ kind: "EARNING", code: "13TH_TAXABLE", label: "13th month (taxable excess)", amount: P(thirteenthC - exemptC), taxable: true });

  const days = Math.max(0, i.encashDays);
  const rateC = C(dailyRateOf(i.payType, i.basicPay, cfg));
  const exemptDays = Math.min(days, LEAVE_ENCASH_EXEMPT_DAYS);
  extra.push({ kind: "EARNING", code: "LEAVE_ENCASH", label: "Leave encashment", amount: P(Math.round(rateC * exemptDays)), taxable: false, qty: exemptDays });
  extra.push({ kind: "EARNING", code: "LEAVE_ENCASH", label: "Leave encashment (taxable)", amount: P(Math.round(rateC * (days - exemptDays))), taxable: true, qty: Math.round((days - exemptDays) * 100) / 100 });

  for (const a of i.assets) extra.push({ kind: "DEDUCTION", code: "ASSET", label: `Unreturned: ${a.label}`, amount: a.amount, taxable: false, ref: a.id });

  return computePayslip({ ...base, adjustments: [...(i.adjustments ?? []), ...extra] });
}

// ---------- Salary history ----------

export type CompRow = { from: string; payType: "MONTHLY" | "DAILY"; basicPay: number; allowance: number };

/**
 * Pay to use for a period when salary history has a change inside it. Each rate is weighted by the calendar days it
 * covers in [start, end]: e.g. a raise from 30,000 to 36,000 on the 11th of a 1-15 cutoff pays
 * (30,000 x 10 + 36,000 x 5) / 15 = 32,000 per month for that cutoff, and the daily rate, OT, absences and
 * contributions all follow from that blended rate. A pay type change mid-period uses the latest row (ponytail).
 * Returns null when no row applies (caller falls back to the employee record).
 */
export function prorateCompensation(rows: CompRow[], start: string, end: string): (Omit<CompRow, "from"> & { changed: boolean }) | null {
  const sorted = rows.filter((r) => r.from <= end).sort((a, b) => a.from.localeCompare(b.from));
  if (!sorted.length) return null;
  let baseIdx = 0;
  sorted.forEach((r, k) => {
    if (r.from <= start) baseIdx = k;
  });
  const segs = sorted.slice(baseIdx).map((r, k) => ({ ...r, from: k === 0 && r.from < start ? start : r.from }));
  const last = segs[segs.length - 1]!;
  if (segs.length === 1 || segs.some((s) => s.payType !== last.payType)) return { payType: last.payType, basicPay: last.basicPay, allowance: last.allowance, changed: segs.length > 1 };
  const day = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86_400_000;
  const total = day(end) - day(segs[0]!.from) + 1;
  let basic = 0;
  let allow = 0;
  segs.forEach((s, k) => {
    const days = (k + 1 < segs.length ? day(segs[k + 1]!.from) : day(end) + 1) - day(s.from);
    basic += C(s.basicPay) * days;
    allow += C(s.allowance) * days;
  });
  return { payType: last.payType, basicPay: P(Math.round(basic / total)), allowance: P(Math.round(allow / total)), changed: true };
}

// ---------- GL journal ----------

export type AccountMap = {
  salariesExpense: string;
  employerContribExpense: string;
  reimbursements: string;
  sssPayable: string;
  philhealthPayable: string;
  pagibigPayable: string;
  taxPayable: string;
  loansReceivable: string;
  employeeAdvances: string;
  otherDeductions: string;
  netPayPayable: string;
  /** Department name -> cost center code (expense lines only) */
  costCenters: Record<string, string>;
};

export const DEFAULT_ACCOUNTS: AccountMap = {
  salariesExpense: "6100 Salaries and wages",
  employerContribExpense: "6110 SSS, PhilHealth and Pag-IBIG (employer)",
  reimbursements: "6300 Reimbursable expenses",
  sssPayable: "2110 SSS payable",
  philhealthPayable: "2120 PhilHealth payable",
  pagibigPayable: "2130 Pag-IBIG payable",
  taxPayable: "2140 Withholding tax payable",
  loansReceivable: "1210 Loans receivable - employees",
  employeeAdvances: "1220 Advances to employees",
  otherDeductions: "2190 Other payroll deductions payable",
  netPayPayable: "2100 Salaries payable",
  costCenters: {},
};

export type JournalLine = { account: string; costCenter: string; memo: string; debit: number; credit: number };

/** Summary journal entry for a payroll run. Debits = credits by construction (net = earnings - deductions + amount due). */
export function buildJournal(slips: { lines: PayslipLine[]; department?: string | null }[], a: AccountMap): JournalLine[] {
  const acc = new Map<string, JournalLine & { c: number }>();
  const post = (side: "debit" | "credit", account: string, memo: string, c: number, costCenter = "") => {
    if (!c) return;
    const k = `${side}|${account}|${costCenter}|${memo}`;
    const row = acc.get(k) ?? { account, costCenter, memo, debit: 0, credit: 0, c: 0 };
    row.c += side === "debit" ? c : -c;
    acc.set(k, row);
  };
  const cashAdvance = LOAN_TYPE_LABELS.CASH_ADVANCE;
  for (const s of slips) {
    const cc = (s.department && a.costCenters[s.department]) || "";
    let netC = 0;
    for (const l of s.lines) {
      const c = C(l.amount);
      if (l.kind === "earning") {
        netC += c;
        if (l.code === "REIMBURSE") post("debit", a.reimbursements, "Reimbursements", c, cc);
        else if (l.code === "TAX_REFUND") post("debit", a.taxPayable, "Tax refunds", c);
        else post("debit", a.salariesExpense, "Gross pay", c, cc);
      } else if (l.kind === "employer") {
        post("debit", a.employerContribExpense, "Employer contributions", c, cc);
        const payable = l.code.startsWith("SSS") ? a.sssPayable : l.code.startsWith("PHILHEALTH") ? a.philhealthPayable : a.pagibigPayable;
        post("credit", payable, "Employer share", c);
      } else if (l.kind === "info") {
        if (l.code === "AMOUNT_DUE") {
          netC += c;
          post("debit", a.employeeAdvances, "Due from separated employees", c);
        }
      } else {
        netC -= c;
        const [account, memo] =
          l.code === "SSS" ? [a.sssPayable, "Employee share"]
          : l.code === "PHILHEALTH" ? [a.philhealthPayable, "Employee share"]
          : l.code === "PAGIBIG" ? [a.pagibigPayable, "Employee share"]
          : l.code === "TAX" ? [a.taxPayable, "Withholding tax"]
          : l.code === "LOAN" ? (l.label === cashAdvance ? [a.employeeAdvances, "Cash advance repayments"] : [a.loansReceivable, "Loan repayments"])
          : [a.otherDeductions, "Other deductions"];
        post("credit", account, memo, c);
      }
    }
    post("credit", a.netPayPayable, "Net pay", netC);
  }
  return [...acc.values()]
    .filter((r) => r.c !== 0)
    .map(({ c, ...r }) => ({ ...r, debit: c > 0 ? P(c) : 0, credit: c < 0 ? P(-c) : 0 }))
    .sort((x, y) => Number(y.debit > 0) - Number(x.debit > 0) || x.account.localeCompare(y.account) || x.costCenter.localeCompare(y.costCenter));
}

// ---------- 13th month (PD 851) ----------

/**
 * 13th month = total basic salary earned in the calendar year / 12 (naturally pro-rated for new hires).
 * Exempt up to the ceiling; the excess is taxable, withheld at the marginal monthly rate over monthly basic.
 * ponytail: ceiling ignores other benefits paid in the year; year-end annualization owns the true-up.
 */
export function computeThirteenthMonth(i: { basicEarnedYtd: number; monthlyBasic: number; config: PayrollConfig }): PayslipResult {
  const amountC = Math.round(C(i.basicEarnedYtd) / 12);
  const exemptC = Math.min(amountC, C(i.config.thirteenthMonthExempt));
  const excessC = amountC - exemptC;
  const t = i.config.tax.monthly;
  const taxC = excessC > 0 ? C(withholdingTax(i.monthlyBasic + P(excessC), t)) - C(withholdingTax(i.monthlyBasic, t)) : 0;
  const lines: PayslipLine[] = [{ kind: "earning", code: "13TH", label: "13th month pay", amount: P(exemptC) }];
  if (excessC > 0) lines.push({ kind: "earning", code: "13TH_TAXABLE", label: "13th month (taxable excess)", amount: P(excessC) });
  if (taxC > 0) lines.push({ kind: "deduction", code: "TAX", label: "Withholding tax", amount: P(taxC) });
  return { lines, basicPay: 0, grossPay: P(amountC), sss: 0, philhealth: 0, pagibig: 0, withholdingTax: P(taxC), totalDeductions: P(taxC), netPay: P(amountC - taxC) };
}

// ---------- Cutoffs ----------

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The cutoff that follows `afterEnd` (YYYY-MM-DD), or the one containing `today` when there is no previous run. */
export function nextCutoff(frequency: "SEMI_MONTHLY" | "MONTHLY", ref: string, schedule: PayrollConfig["schedule"], afterEnd = true) {
  let [y, m, d] = ref.split("-").map(Number) as [number, number, number];
  if (afterEnd) {
    // day after ref
    d += 1;
    if (d > lastDay(y, m)) {
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  const end = lastDay(y, m);
  const payDay = (n: number) => (n <= 0 || n > end ? end : n);
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  if (frequency === "MONTHLY") return { periodStart: iso(y, m, 1), periodEnd: iso(y, m, end), payDate: iso(y, m, payDay(schedule.secondPayDay)), name: `${monthName} ${y}`, half: 2 as const };
  if (d <= 15) return { periodStart: iso(y, m, 1), periodEnd: iso(y, m, 15), payDate: iso(y, m, payDay(schedule.firstPayDay)), name: `${monthName} 1-15, ${y}`, half: 1 as const };
  return { periodStart: iso(y, m, 16), periodEnd: iso(y, m, end), payDate: iso(y, m, payDay(schedule.secondPayDay)), name: `${monthName} 16-${end}, ${y}`, half: 2 as const };
}

/** Which semi-monthly half a period is (by its start day). */
export const cutoffHalf = (periodStart: string): 1 | 2 => (Number(periodStart.slice(8, 10)) <= 15 ? 1 : 2);
