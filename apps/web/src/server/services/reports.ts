import "server-only";
import { z } from "zod";
import { prisma, type Prisma } from "@hris/db";
import {
  DEFAULT_TIMEZONE,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  TIMESHEET_STATUSES,
  zonedParts,
  type SessionUser,
} from "@hris/shared";
import { scopeWhere } from "../authz";
import { dtrEmployeeSelect, dtrTotalsForMonth } from "./attendance";
import { fullName } from "./employees";
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
    prisma.employee.findMany({ where: scope(user, f.departmentId), orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: whoSelect }),
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
  const ent = new Map(ents.map((e) => [`${e.employeeId}:${e.leaveTypeId}`, Number(e.entitledDays) + Number(e.carriedOver) + Number(e.adjustment)]));
  const use = new Map(usage.map((u) => [`${u.employeeId}:${u.leaveTypeId}:${u.status}`, Number(u._sum.totalDays ?? 0)]));
  const rows: Record<string, Cell>[] = [];
  for (const e of emps)
    for (const t of types) {
      const k = `${e.id}:${t.id}`;
      const entitled = ent.get(k) ?? 0;
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
    description: `Entitled includes carry-over and adjustments · ${year}`,
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

async function employees(user: SessionUser, p: URLSearchParams): Promise<Report> {
  const f = parse(p);
  let cols = EMPLOYEE_COLUMNS.filter((c) => f.cols.includes(c.key));
  if (!cols.length) cols = EMPLOYEE_COLUMNS.filter((c) => DEFAULT_COLS.includes(c.key));
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

export const REPORTS = { headcount, leave, attendance, timesheets, employees } satisfies Record<string, (u: SessionUser, p: URLSearchParams) => Promise<Report>>;
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
