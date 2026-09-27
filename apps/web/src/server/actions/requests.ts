"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { coeSchema, expenseSchema, loanSchema, overtimeSchema, requestDecisionSchema, REQUEST_KINDS, type RequestKind, type SessionUser } from "@hris/shared";
import { requireSession } from "../auth/session";
import * as svc from "../services/requests";
import { bools, formToObject, parse, run, type ActionResult } from "./_helpers";

function revalidate(kind: RequestKind, id?: string) {
  revalidatePath("/requests");
  revalidatePath(`/requests/${kind}`);
  if (id) revalidatePath(`/requests/${kind}/${id}`);
  revalidatePath("/dashboard");
}

type Created = ActionResult<{ id: string }>;

async function create<S extends z.ZodType>(kind: RequestKind, schema: S, input: unknown, fn: (actor: SessionUser, d: z.infer<S>) => Promise<{ id: string }>, message: string): Promise<Created> {
  const actor = await requireSession();
  const p = parse(schema, input);
  if ("error" in p) return p.error;
  const r = await run(async () => ({ id: (await fn(actor, p.data)).id }), message);
  if (r.ok) revalidate(kind, r.data.id);
  return r;
}

export async function createOvertimeAction(_p: Created | undefined, fd: FormData) {
  return create("overtime", overtimeSchema, formToObject(fd), svc.createOvertime, "Overtime filed");
}

export async function createCoeAction(_p: Created | undefined, fd: FormData) {
  return create("coe", coeSchema, bools(formToObject(fd), ["includeCompensation"]), svc.createCoe, "Request sent to HR");
}

export async function createExpenseAction(_p: Created | undefined, fd: FormData) {
  const file = fd.get("receipt");
  fd.delete("receipt");
  return create("expenses", expenseSchema, formToObject(fd), (a, d) => svc.createExpense(a, d, file instanceof File ? file : null), "Expense claim submitted");
}

export async function createLoanAction(_p: Created | undefined, fd: FormData) {
  return create("loans", loanSchema, formToObject(fd), svc.createLoan, "Loan saved");
}

const kindOf = (k: string): RequestKind => {
  if (!(REQUEST_KINDS as readonly string[]).includes(k)) throw new Error("Unknown request kind");
  return k as RequestKind;
};

export async function decideRequestAction(kind: RequestKind, id: string, _p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const actor = await requireSession();
  const p = parse(requestDecisionSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const r = await run(() => svc.decideRequest(actor, kindOf(kind), id, p.data), p.data.decision === "APPROVED" ? "Approved" : "Rejected");
  revalidate(kind, id);
  return r;
}

export async function cancelRequestAction(kind: RequestKind, id: string): Promise<ActionResult> {
  const actor = await requireSession();
  const r = await run(() => svc.cancelRequest(actor, kindOf(kind), id), "Request cancelled");
  revalidate(kind, id);
  return r;
}
