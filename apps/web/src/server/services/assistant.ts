import "server-only";
import { z } from "zod";
import { prisma } from "@hris/db";
import { AI_HISTORY, LEAVE_STATUSES, type AssistantRequest, type SessionUser } from "@hris/shared";
import { toolLoop, type Tool } from "../ai";
import { dtrForMonth } from "./attendance";
import { getBalances } from "./leave";
import { employeeHolidayWhere } from "./org";
import { getSetting } from "./settings";
import { AppError } from "./errors";
import { rateLimit } from "../rate-limit";

/**
 * Employee self-service HR assistant. Every tool is scoped to the signed-in user's own employee record:
 * no tool takes an employeeId, so the model can never read anyone else's data (even for managers / HR).
 */

const manila = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d); // YYYY-MM-DD
const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

type Def = { description: string; input: z.ZodObject; run: (input: never, employeeId: string) => Promise<unknown> };
const def = <S extends z.ZodObject>(description: string, input: S, run: (i: z.infer<S>, employeeId: string) => Promise<unknown>): Def => ({ description, input, run: run as Def["run"] });

const TOOLS: Record<string, Def> = {
  get_leave_balances: def(
    "Leave balances (days) per leave type for the user for a year: entitled, carried over, used, pending, available.",
    z.object({ year: z.number().int().min(2000).max(2100).optional().describe("Defaults to the current year") }),
    async ({ year }, e) =>
      (await getBalances(e, year ?? Number(manila().slice(0, 4)))).map((b) => ({ leaveType: b.leaveTypeName, code: b.leaveTypeCode, year: b.year, entitled: b.entitled, carriedOver: b.carriedOver, adjustment: b.adjustment, used: b.used, pending: b.pending, available: b.available })),
  ),
  list_my_leave_requests: def(
    "The user's 10 most recent leave requests, optionally filtered by status.",
    z.object({ status: z.enum(LEAVE_STATUSES).optional() }),
    async ({ status }, e) =>
      (
        await prisma.leaveRequest.findMany({
          where: { employeeId: e, ...(status ? { status } : {}) },
          orderBy: { startDate: "desc" },
          take: 10,
          select: { startDate: true, endDate: true, totalDays: true, status: true, reason: true, leaveType: { select: { name: true } } },
        })
      ).map((r) => ({ leaveType: r.leaveType.name, from: day(r.startDate), to: day(r.endDate), days: Number(r.totalDays), status: r.status, reason: r.reason })),
  ),
  list_holidays: def(
    "Company holidays that apply to the user (nationwide + their location) between two dates. Defaults to the next 12 months.",
    z.object({ from: z.iso.date().optional().describe("YYYY-MM-DD"), to: z.iso.date().optional().describe("YYYY-MM-DD") }),
    async ({ from, to }, e) => {
      const start = new Date(from ?? manila());
      const end = to ? new Date(to) : new Date(start.getTime() + 366 * 864e5);
      const rows = await prisma.holiday.findMany({ where: { date: { gte: start, lte: end }, ...employeeHolidayWhere(e) }, orderBy: { date: "asc" }, take: 30, select: { name: true, date: true, type: true } });
      return rows.map((h) => ({ name: h.name, date: day(h.date), type: h.type }));
    },
  ),
  get_my_attendance_summary: def(
    "The user's attendance (DTR) totals for a month plus days that were absent, incomplete or late.",
    z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe("YYYY-MM, defaults to the current month") }),
    async ({ month }, e) => {
      const m = month ?? manila().slice(0, 7);
      const d = await dtrForMonth(e, m);
      return {
        month: m,
        shift: d.shift.name,
        totals: d.totals,
        issues: d.rows.filter((r) => r.status === "ABSENT" || r.status === "INCOMPLETE" || r.lateMinutes > 0).map((r) => ({ date: r.date, status: r.status, timeIn: r.timeIn, timeOut: r.timeOut, lateMinutes: r.lateMinutes })),
      };
    },
  ),
  get_latest_payslip: def("The user's latest finalized or paid payslip: period, pay date, totals (PHP) and itemized lines.", z.object({}), async (_i, e) => {
    const p = await prisma.payslip.findFirst({
      where: { employeeId: e, run: { status: { in: ["FINALIZED", "PAID"] } } },
      orderBy: { run: { payDate: "desc" } },
      select: {
        basicPay: true, grossPay: true, sss: true, philhealth: true, pagibig: true, withholdingTax: true, totalDeductions: true, netPay: true, lines: true,
        run: { select: { name: true, periodStart: true, periodEnd: true, payDate: true, status: true } },
      },
    });
    if (!p) return { found: false };
    const { run, lines, ...totals } = p;
    return { found: true, run: run.name, periodStart: day(run.periodStart), periodEnd: day(run.periodEnd), payDate: day(run.payDate), status: run.status, ...Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Number(v)])), lines };
  }),
  search_policies: def(
    "Search published company policies (acknowledgement-required or pinned announcements) by keywords. Returns up to 5 with id, title and text.",
    z.object({ query: z.string().trim().min(1).max(200) }),
    async ({ query }) => {
      const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter((w) => !STOP.has(w)).slice(0, 8);
      const rows = await prisma.announcement.findMany({
        where: {
          publishedAt: { not: null, lte: new Date() },
          OR: [{ requiresAck: true }, { pinned: true }],
          ...(words.length ? { AND: [{ OR: words.flatMap((w) => [{ title: { contains: w, mode: "insensitive" as const } }, { body: { contains: w, mode: "insensitive" as const } }]) }] } : {}),
        },
        orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
        take: 5,
        select: { id: true, title: true, body: true, publishedAt: true },
      });
      return rows.map((r) => ({ id: r.id, title: r.title, published: day(r.publishedAt), text: r.body.slice(0, 3000) }));
    },
  ),
  get_my_profile: def("The user's own job profile: name, employee code, job title, department, location, manager, hire date, employment status/type.", z.object({}), async (_i, e) => {
    const p = await prisma.employee.findUnique({
      where: { id: e },
      select: {
        employeeCode: true, firstName: true, lastName: true, preferredName: true, hireDate: true, employmentStatus: true, employmentType: true,
        jobTitle: { select: { name: true } }, department: { select: { name: true } }, location: { select: { name: true } }, manager: { select: { firstName: true, lastName: true, preferredName: true } },
      },
    });
    if (!p) throw new AppError("Employee record not found");
    return {
      name: `${p.preferredName ?? p.firstName} ${p.lastName}`, employeeCode: p.employeeCode, jobTitle: p.jobTitle?.name ?? null, department: p.department?.name ?? null, location: p.location?.name ?? null,
      manager: p.manager ? `${p.manager.preferredName ?? p.manager.firstName} ${p.manager.lastName}` : null, hireDate: day(p.hireDate), employmentStatus: p.employmentStatus, employmentType: p.employmentType,
    };
  }),
};
const STOP = new Set(["what", "whats", "our", "the", "policy", "policies", "about", "for", "and", "with", "company", "how", "does", "is", "are", "can", "any", "there"]);

const toolDefs: Tool[] = Object.entries(TOOLS).map(([name, t]) => {
  const { $schema: _, ...schema } = z.toJSONSchema(t.input) as Record<string, unknown>;
  return { name, description: t.description, input_schema: schema };
});

export async function runTool(user: SessionUser, name: string, input: unknown) {
  const t = TOOLS[name];
  if (!t) throw new AppError(`Unknown tool ${name}`);
  if (!user.employeeId) throw new AppError("This account is not linked to an employee record, so there is no personal HR data to look up.");
  const r = t.input.safeParse(input ?? {});
  if (!r.success) throw new AppError(`Invalid input: ${r.error.issues.map((i) => i.message).join("; ")}`);
  return t.run(r.data as never, user.employeeId);
}

async function systemPrompt(user: SessionUser) {
  const company = await getSetting("company");
  return `You are the HR assistant for ${company.name}. You are talking with ${user.name}. Today is ${manila()} (Asia/Manila).
Rules:
- Answer only from tool results. If something is not in the data, say so plainly and suggest contacting HR.
- You can only see this user's own records. Politely decline questions about other employees.
- When you use a policy, cite its title.
- Money is in PHP (for example PHP 25,000.00). Write dates like 5 Oct 2026, in Asia/Manila time.
- Be concise: short paragraphs or bullet lists, markdown bold is fine, no tables, no HTML.
- Do not give legal or tax advice beyond what company policy states.`;
}

export type AssistantEvent = { type: "text"; text: string } | { type: "tool"; name: string } | { type: "error"; message: string } | { type: "done" };

export async function askAssistant(user: SessionUser, req: AssistantRequest, emit: (e: AssistantEvent) => void) {
  let messages = req.messages.slice(-AI_HISTORY);
  while (messages[0]?.role === "assistant") messages = messages.slice(1); // must start with a user turn
  await toolLoop({
    system: await systemPrompt(user),
    messages,
    tools: toolDefs,
    maxTokens: 1024,
    onText: (text) => emit({ type: "text", text }),
    onTool: (name) => emit({ type: "tool", name }),
    run: (name, input) => runTool(user, name, input),
  });
}

/** 10 messages per minute per user (was an in-memory 10-burst bucket refilling 1 per 6s). */
export const assistantLimit = (userId: string) => rateLimit(`assistant:user:${userId}`, 10, 60);
