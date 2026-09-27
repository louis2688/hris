import "server-only";
import { z } from "zod";
import { prisma, type Prisma } from "@hris/db";
import {
  DEFAULT_TIMEZONE,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  TIMESHEET_STATUSES,
  accruedDays,
  zonedParts,
  type SessionUser,
} from "@hris/shared";
import { scopeWhere } from "../authz";
import { dtrEmployeeSelect, dtrTotalsForMonth } from "./attendance";
import { fullName } from "./employees";
import { listFieldDefs, fmtCustom } from "./custom-fields";
import { describeChange } from "./employment-events";
import { fmtDate } from "@/lib/utils";

export type Cell = string | number;
export type Column = { key: string; label: string; num?: boolean };
export type Report = {
  title: string;
  description: string;
  columns: Column[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
  /** Resolved filter values (defaults applied) so the form can show them. */
  filters: Record<string, string>;
};

// ---------- Filters ----------

const opt = <T extends z.ZodType>(s: T) => s.optional().catch(undefined);
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().min(1).max(64);
// ponytail: bad values fall back to defaults instead of 422, reports are read-only.
const filterSchema = z.object({
  from: opt(iso),
  to: opt(iso),
  month: opt(z.string().regex(/^\d{4}-\d{2}$/)),
  year: opt(z.coerce.number().int().min(2000).max(2100)),
  departmentId: opt(id),
  locationId: opt(id),
  leaveTypeId: opt(id),
  projectId: opt(id),
  status: opt(z.string().max(32)),
  groupBy: z.enum(["department", "status", "type"]).catch("department"),
  type: opt(z.enum(["PROMOTION", "TRANSFER"])),
  days: opt(z.coerce.number().int().min(1).max(365)),
  cols: z.array(z.string()).catch([]),
});

function parse(p: URLSearchParams) {
  const f = filterSchema.parse({ ...Object.fromEntries(p), cols: p.getAll("cols") });
  return { ...f, today: zonedParts(new Date(), DEFAULT_TIMEZONE).date };
}

/** Next.js searchParams object -> URLSearchParams (keeps repeated keys like cols). */
export function searchToParams(sp: Record<string, string | string[] | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of [v ?? []].flat()) if (x) p.append(k, x);
  return p;
}

const pick = <T extends string>(list: readonly T[], v?: string) => (list as readonly string[]).includes(v ?? "") ? (v as T) : undefined;
const SEPARATED = ["RESIGNED", "TERMINATED"] as const;
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const round = (n: number) => Math.round(n * 100) / 100;
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
const nameCols: Column[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Employee" },
  { key: "department", label: "Department" },
];
const who = (e: { employeeCode: string; firstName: string; lastName: string; preferredName: string | null; department: { name: string } | null }) => ({
  code: e.employeeCode,
  name: fullName(e),
  department: e.department?.name ?? "",
});
const whoSelect = { id: true, employeeCode: true, firstName: true, lastName: true, preferredName: true, department: { select: { name: true } } } as const;

function totalsOf(columns: Column[], rows: Record<string, Cell>[]) {
  const t: Record<string, Cell> = { [columns[0]!.key]: "Total" };
  for (const c of columns) if (c.num) t[c.key] = round(rows.reduce((a, r) => a + Number(r[c.key] ?? 0), 0));
  return t;
}

/** Employees the user may report on: everyone for HR/Admin, self + direct reports for managers. */
function scope(user: SessionUser, departmentId?: string): Prisma.EmployeeWhereInput {
  return { deletedAt: null, ...scopeWhere(user), ...(departmentId ? { departmentId } : {}) };
}

// ---------- Reports ----------

async function headcount(user: SessionUser, p: URLSearchParams): Promise<Report> {
  const f = parse(p);
  const from = f.from ?? `${f.today.slice(0, 4)}-01-01`;
  const to = f.to ?? f.today;
  // ponytail: grouped in JS; fine for a few thousand employees, switch to groupBy if it grows past that.
  const emps = await prisma.employee.findMany({
    where: scope(user, f.departmentId),
    select: { employmentStatus: true, employmentType: true, hireDate: true, terminationDate: true, department: { select: { name: true } } },
  });
  const groups = new Map<string, { headcount: number; hires: number; separations: number }>();
  const inRange = (d: Date | null) => !!d && day(d) >= from && day(d) <= to;
  for (const e of emps) {
    const k =
      f.groupBy === "status" ? EMPLOYMENT_STATUS_LABELS[e.employmentStatus] : f.groupBy === "type" ? EMPLOYMENT_TYPE_LABELS[e.employmentType] : (e.department?.name ?? "(No department)");
    const g = groups.get(k) ?? groups.set(k, { headcount: 0, hires: 0, separations: 0 }).get(k)!;
    if (!(SEPARATED as readonly string[]).includes(e.employmentStatus)) g.headcount++;
    if (inRange(e.hireDate)) g.hires++;
    if (inRange(e.terminationDate)) g.separations++;
  }
  const columns: Column[] = [
    { key: "group", label: { department: "Department", status: "Employment status", type: "Employment type" }[f.groupBy] },
    { key: "headcount", label: "Headcount (current)", num: true },
    { key: "hires", label: "New hires", num: true },
    { key: "separations", label: "Separations", num: true },
  ];
  const rows = [...groups]
    .filter(([, g]) => g.headcount || g.hires || g.separations)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, g]) => ({ group, ...g }));
  return {
    title: "Headcount",
    description: `New hires and separations from ${fmtDate(from)} to ${fmtDate(to)}`,
    columns,
    rows,
    totals: totalsOf(columns, rows),
    filters: { from, to, groupBy: f.groupBy, departmentId: f.departmentId ?? "" },
  };
}

async function leave(user: SessionUser, p: URLSearchParams): Promise<Report> {
  const f = parse(p);
  const year = f.year ?? Number(f.today.slice(0, 4));
  const [emps, types] = await Promise.all([
    prisma.employee.findMany({ where: scope(user, f.departmentId), orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { ...whoSelect, hireDate: true } }),
    prisma.leaveType.findMany({ where: { isActive: true, ...(f.leaveTypeId ? { id: f.leaveTypeId } : {}) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const ids = emps.map((e) => e.id);
  // Same math as getBalances in leave.ts, batched for every employee in 2 queries instead of 3 per employee.
  const [ents, usage] = await Promise.all([
    prisma.leaveEntitlement.findMany({ where: { year, employeeId: { in: ids } } }),
    prisma.leaveRequest.groupBy({
      by: ["employeeId", "leaveTypeId", "status"],
      where: { employeeId: { in: ids }, status: { in: ["APPROVED", "PENDING"] }, startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } },
      _sum: { totalDays: true },
    }),
  ]);
  const ent = new Map(ents.map((e) => [`${e.employeeId}:${e.leaveTypeId}`, e]));
  const use = new Map(usage.map((u) => [`${u.employeeId}:${u.leaveTypeId}:${u.status}`, Number(u._sum.totalDays ?? 0)]));
  const rows: Record<string, Cell>[] = [];
  for (const e of emps)
    for (const t of types) {
      const k = `${e.id}:${t.id}`;
      const en = ent.get(k);
      const base = Number(en?.entitledDays ?? 0);
      // Accruing types show days earned so far, same as getBalances.
      const earned = t.accrualPerMonth != null ? accruedDays(base, Number(t.accrualPerMonth), year, day(e.hireDate), f.today) : base;
      const entitled = round(earned + Number(en?.carriedOver ?? 0) + Number(en?.adjustment ?? 0));
      const used = use.get(`${k}:APPROVED`) ?? 0;
      const pending = use.get(`${k}:PENDING`) ?? 0;
      // ponytail: skip employee/type pairs with nothing to report, keeps the sheet readable.
      if (!entitled && !used && !pending) continue;
      rows.push({ ...who(e), type: t.name, entitled, used, pending, available: round(entitled - used - pending) });
    }
  const columns: Column[] = [
    ...nameCols,
    { key: "type", label: "Leave type" },
    { key: "entitled", label: "Entitled", num: true },
    { key: "used", label: "Used", num: true },
    { key: "pending", label: "Pending", num: true },
    { key: "available", label: "Available", num: true },
  ];
  return {
    title: "Leave balances",
    description: `Entitled includes carry-over and adjustments; accruing types show days earned so far · ${year}`,
    columns,
    rows,
    totals: totalsOf(columns, rows),
    filters: { year: String(year), departmentId: f.departmentId ?? "", leaveTypeId: f.leaveTypeId ?? "" },
  };
}

async function attendance(user: SessionUser, p: URLSearchParams): Promise<Report> {
  const f = parse(p);
  const month = f.month ?? f.today.slice(0, 7);
  const emps = await prisma.employee.findMany({
    where: { ...scope(user, f.departmentId), employmentStatus: { notIn: [...SEPARATED] } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { ...whoSelect, ...dtrEmployeeSelect },
  });
  const totals = await dtrTotalsForMonth(emps, month);
  const rows: Record<string, Cell>[] = emps.map((e) => {
    const t = totals.get(e.id)!;
    return {
      ...who(e),
      present: t.present,
      absent: t.absent,
      leaveDays: t.leaveDays,
      lateCount: t.lateCount,
      lateMinutes: t.lateMinutes,
      undertimeMinutes: t.undertimeMinutes,
      overtimeMinutes: t.overtimeMinutes,
      hours: round(t.workedMinutes / 60),
    };
  });
  const columns: Column[] = [
    ...nameCols,
    { key: "present", label: "Present", num: true },
    { key: "absent", label: "Absences", num: true },
    { key: "leaveDays", label: "Leave days", num: true },
    { key: "lateCount", label: "Late (times)", num: true },
    { key: "lateMinutes", label: "Late (min)", num: true },
    { key: "undertimeMinutes", label: "Undertime (min)", num: true },
    { key: "overtimeMinutes", label: "OT (min)", num: true },
    { key: "hours", label: "Hours worked", num: true },
  ];
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
  return { title: "Attendance summary", description: `Monthly DTR summary · ${label}`, columns, rows, totals: totalsOf(columns, rows), filters: { month, departmentId: f.departmentId ?? "" } };
}

async function timesheets(user: SessionUser, p: URLSearchParams): Promise<Report> {
  const f = parse(p);
  const from = f.from ?? `${f.today.slice(0, 7)}-01`;
  const to = f.to ?? f.today;
  const status = f.status === "ALL" ? undefined : (pick(TIMESHEET_STATUSES, f.status) ?? "APPROVED");
  const entries = await prisma.timesheetEntry.findMany({
    where: {
      date: { gte: new Date(from), lte: new Date(to) },
      ...(f.projectId ? { projectId: f.projectId } : {}),
      timesheet: { ...(status ? { status } : {}), employee: scope(user, f.departmentId) },
    },
    select: { hours: true, project: { select: { name: true, client: true } }, timesheet: { select: { employee: { select: whoSelect } } } },
  });
  const agg = new Map<string, Record<string, Cell>>();
  for (const x of entries) {
    const e = x.timesheet.employee;
    const k = `${e.id}:${x.project.name}`;
    const r = agg.get(k) ?? agg.set(k, { ...who(e), project: x.project.name, client: x.project.client ?? "", hours: 0 }).get(k)!;
    r.hours = round(Number(r.hours) + Number(x.hours));
  }
  const rows = [...agg.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.project).localeCompare(String(b.project)));
  const columns: Column[] = [...nameCols, { key: "project", label: "Project" }, { key: "client", label: "Client" }, { key: "hours", label: "Hours", num: true }];
  return {
    title: "Timesheet hours",
    description: `${status ? title(status) : "All"} timesheets from ${fmtDate(from)} to ${fmtDate(to)}`,
    columns,
    rows,
    totals: totalsOf(columns, rows),
    filters: { from, to, status: status ?? "ALL", departmentId: f.departmentId ?? "", projectId: f.projectId ?? "" },
  };
}

const empSelect = {
  employeeCode: true,
  firstName: true,
  middleName: true,
  lastName: true,
  preferredName: true,
  workEmail: true,
  phone: true,
  mobile: true,
  city: true,
  gender: true,
  dateOfBirth: true,
  nationality: true,
  employmentStatus: true,
  employmentType: true,
  hireDate: true,
  terminationDate: true,
  biometricId: true,
  user: { select: { email: true } },
  department: { select: { name: true } },
  jobTitle: { select: { name: true } },
  location: { select: { name: true } },
  manager: { select: { firstName: true, lastName: true, preferredName: true } },
  shift: { select: { name: true } },
  customFields: true,
} satisfies Prisma.EmployeeSelect;
type Emp = Prisma.EmployeeGetPayload<{ select: typeof empSelect }>;

export const EMPLOYEE_COLUMNS: { key: string; label: string; get: (e: Emp) => Cell }[] = [
  { key: "code", label: "Code", get: (e) => e.employeeCode },
  { key: "name", label: "Name", get: (e) => fullName(e) },
  { key: "email", label: "Email", get: (e) => e.workEmail ?? e.user?.email ?? "" },
  { key: "department", label: "Department", get: (e) => e.department?.name ?? "" },
  { key: "jobTitle", label: "Job title", get: (e) => e.jobTitle?.name ?? "" },
  { key: "location", label: "Location", get: (e) => e.location?.name ?? "" },
  { key: "manager", label: "Manager", get: (e) => (e.manager ? fullName(e.manager) : "") },
  { key: "status", label: "Status", get: (e) => EMPLOYMENT_STATUS_LABELS[e.employmentStatus] },
  { key: "type", label: "Type", get: (e) => EMPLOYMENT_TYPE_LABELS[e.employmentType] },
  { key: "hireDate", label: "Hire date", get: (e) => day(e.hireDate) },
  { key: "terminationDate", label: "Separation date", get: (e) => day(e.terminationDate) },
  { key: "gender", label: "Gender", get: (e) => title(e.gender) },
  { key: "dateOfBirth", label: "Date of birth", get: (e) => day(e.dateOfBirth) },
  { key: "nationality", label: "Nationality", get: (e) => e.nationality ?? "" },
  { key: "phone", label: "Phone", get: (e) => e.mobile ?? e.phone ?? "" },
  { key: "city", label: "City", get: (e) => e.city ?? "" },
  { key: "shift", label: "Shift", get: (e) => e.shift?.name ?? "" },
  { key: "biometricId", label: "Biometric ID", get: (e) => e.biometricId ?? "" },
];
const DEFAULT_COLS = ["code", "name", "department", "jobTitle", "status"];

/** Static columns plus, for HR/Admin, one per active custom field (key `cf_<key>`). */
export async function employeeColumns(withCustom: boolean) {
  const defs = withCustom ? await listFieldDefs(true) : [];
  return [
    ...EMPLOYEE_COLUMNS,
    ...defs.map((d) => ({ key: `cf_${d.key}`, label: d.label, get: (e: Emp) => fmtCustom(d, (e.customFields as Record<string, unknown> | null)?.[d.key]) as Cell })),
  ];
}

async function employees(user: SessionUser, p: URLSearchParams): Promise<Report> {
  const f = parse(p);
  const all = await employeeColumns(!scopeWhere(user));
  let cols = all.filter((c) => f.cols.includes(c.key));
  if (!cols.length) cols = all.filter((c) => DEFAULT_COLS.includes(c.key));
  const status = pick(EMPLOYMENT_STATUSES, f.status);
  const emps = await prisma.employee.findMany({
    where: { ...scope(user, f.departmentId), ...(status ? { employmentStatus: status } : {}), ...(f.locationId ? { locationId: f.locationId } : {}) },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: empSelect,
  });
  return {
    title: "Employee report",
    description: `${emps.length} employee${emps.length === 1 ? "" : "s"}`,
    columns: cols.map(({ key, label }) => ({ key, label })),
    rows: emps.map((e) => Object.fromEntries(cols.map((c) => [c.key, c.get(e)]))),
    filters: { cols: cols.map((c) => c.key).join(","), departmentId: f.departmentId ?? "", status: status ?? "", locationId: f.locationId ?? "" },
  };
}

// ---------- Lifecycle ----------

const DAY = 86_400_000;
const pct = (n: number, d: number) => (d ? round((n / d) * 100) : 0);

/** Turnover % = separations / average of start and end headcount. Tenure = average years of service at the end date. */
async function turnover(user: SessionUser, p: URLSearchParams): Promise<Report> {
  const f = parse(p);
  const from = f.from ?? `${f.today.slice(0, 4)}-01-01`;
  const to = f.to ?? f.today;
  const emps = await prisma.employee.findMany({
    where: scope(user, f.departmentId),
    select: { hireDate: true, terminationDate: true, employmentStatus: true, department: { select: { name: true } } },
  });
  // Separated with no date recorded: treat as gone before the range (they are not in either headcount).
  const endOf = (e: (typeof emps)[number]) => (e.terminationDate ? day(e.terminationDate) : (SEPARATED as readonly string[]).includes(e.employmentStatus) ? "0000-00-00" : "9999-99-99");
  type G = { start: number; end: number; hires: number; separations: number; tenureDays: number };
  const blank = (): G => ({ start: 0, end: 0, hires: 0, separations: 0, tenureDays: 0 });
  const groups = new Map<string, G>();
  const total = blank();
  const add = (g: G, e: (typeof emps)[number]) => {
    const hire = day(e.hireDate);
    const gone = endOf(e);
    if (hire <= from && gone >= from) g.start++;
    if (hire <= to && gone > to) {
      g.end++;
      g.tenureDays += (new Date(to).getTime() - e.hireDate.getTime()) / DAY;
    }
    if (hire >= from && hire <= to) g.hires++;
    if (e.terminationDate && gone >= from && gone <= to) g.separations++;
  };
  for (const e of emps) {
    const k = e.department?.name ?? "(No department)";
    add(groups.get(k) ?? groups.set(k, blank()).get(k)!, e);
    add(total, e);
  }
  const row = (group: string, g: G) => ({
    group,
    start: g.start,
    end: g.end,
    hires: g.hires,
    separations: g.separations,
    turnover: pct(g.separations, (g.start + g.end) / 2),
    tenure: g.end ? round(g.tenureDays / g.end / 365.25) : 0,
  });
  const rows = [...groups].filter(([, g]) => g.start || g.end || g.hires || g.separations).sort(([a], [b]) => a.localeCompare(b)).map(([k, g]) => row(k, g));
  const columns: Column[] = [
    { key: "group", label: "Department" },
    { key: "start", label: "Headcount (start)", num: true },
    { key: "end", label: "Headcount (end)", num: true },
    { key: "hires", label: "Hires", num: true },
    { key: "separations", label: "Separations", num: true },
    { key: "turnover", label: "Turnover %", num: true },
    { key: "tenure", label: "Avg tenure (yrs)", num: true },
  ];
  return {
    title: "Turnover & tenure",
    description: `${fmtDate(from)} to ${fmtDate(to)} · turnover = separations / average headcount`,
    columns,
    rows,
    totals: row("Total", total),
    filters: { from, to, departmentId: f.departmentId ?? "" },
  };
}

async function promotions(user: SessionUser, p: URLSearchParams): Promise<Report> {
  const f = parse(p);
  const from = f.from ?? `${f.today.slice(0, 4)}-01-01`;
  const to = f.to ?? f.today;
  const rows = await prisma.employmentEvent.findMany({
    where: { type: f.type ? f.type : { in: ["PROMOTION", "TRANSFER"] }, effectiveDate: { gte: new Date(from), lte: new Date(to) }, employee: scope(user, f.departmentId) },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    select: { type: true, effectiveDate: true, from: true, to: true, note: true, appliedAt: true, employee: { select: whoSelect } },
  });
  const columns: Column[] = [{ key: "date", label: "Effective" }, ...nameCols, { key: "type", label: "Type" }, { key: "change", label: "Change" }, { key: "note", label: "Note" }, { key: "status", label: "Status" }];
  return {
    title: "Promotions & transfers",
    description: `${f.type ? title(f.type) + "s" : "Promotions and transfers"} effective ${fmtDate(from)} to ${fmtDate(to)}`,
    columns,
    rows: rows.map((r) => ({
      date: day(r.effectiveDate),
      ...who(r.employee),
      type: title(r.type),
      change: describeChange(r.from, r.to).map((c) => `${c.label}: ${c.from ? `${c.from} -> ` : ""}${c.to ?? "None"}`).join("; "),
      note: r.note ?? "",
      status: r.appliedAt ? "Applied" : "Scheduled",
    })),
    filters: { from, to, type: f.type ?? "", departmentId: f.departmentId ?? "" },
  };
}

/** Employee documents already expired or expiring within `days` (default 60). Managers see only docs visible to the employee. */
async function expiringDocuments(user: SessionUser, p: URLSearchParams): Promise<Report> {
  const f = parse(p);
  const days = f.days ?? 60;
  const today = new Date(f.today);
  const docs = await prisma.document.findMany({
    where: {
      caseId: null,
      expiresAt: { not: null, lte: new Date(today.getTime() + days * DAY) },
      employee: scope(user, f.departmentId),
      ...(scopeWhere(user) ? { visibleToEmployee: true } : {}),
    },
    orderBy: { expiresAt: "asc" },
    select: { name: true, category: true, expiresAt: true, employee: { select: whoSelect } },
  });
  const columns: Column[] = [...nameCols, { key: "document", label: "Document" }, { key: "category", label: "Category" }, { key: "expires", label: "Expires" }, { key: "daysLeft", label: "Days left", num: true }];
  return {
    title: "Expiring documents",
    description: `Expired, or expiring within ${days} days of ${fmtDate(f.today)}`,
    columns,
    rows: docs.map((d) => ({ ...who(d.employee!), document: d.name, category: title(d.category), expires: day(d.expiresAt), daysLeft: Math.round((d.expiresAt!.getTime() - today.getTime()) / DAY) })),
    filters: { days: String(days), departmentId: f.departmentId ?? "" },
  };
}

export const REPORTS = { headcount, leave, attendance, timesheets, employees, turnover, promotions, "expiring-documents": expiringDocuments } satisfies Record<string, (u: SessionUser, p: URLSearchParams) => Promise<Report>>;
export type ReportSlug = keyof typeof REPORTS;
export const isReportSlug = (s: string): s is ReportSlug => Object.hasOwn(REPORTS, s);

// ---------- CSV ----------

function csvCell(v: Cell | undefined) {
  if (typeof v === "number") return String(v);
  let s = v ?? "";
  // Formula injection guard: spreadsheet apps execute cells starting with these.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(r: Pick<Report, "columns" | "rows" | "totals">) {
  const lines = [r.columns.map((c) => c.label), ...r.rows.map((row) => r.columns.map((c) => row[c.key])), ...(r.totals ? [r.columns.map((c) => r.totals![c.key])] : [])];
  // BOM so Excel opens UTF-8 names (n with tilde etc.) correctly.
  return "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
