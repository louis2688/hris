import { fmtMinutes, LOAN_TYPE_LABELS, type RequestKind } from "@hris/shared";
import type { Coe, Expense, Loan, Overtime, RequestLists } from "./api";
import { fmtDay, peso } from "./ui";

export const KIND_LABEL: Record<RequestKind, string> = { overtime: "Overtime", expenses: "Expenses", coe: "COE", loans: "Loans" };
/** Kinds the bearer API can file; COE and loans are filed on the web for now. */
export const FILEABLE: RequestKind[] = ["overtime", "expenses"];

type Item = RequestLists[RequestKind][number];

/** One-line title + detail lines for any request row, shared by Requests and Approvals. */
export function describe(kind: RequestKind, r: Item): { title: string; lines: string[]; note: string | null } {
  switch (kind) {
    case "overtime": {
      const o = r as Overtime;
      return { title: `${fmtDay(o.date)} · ${o.startTime}-${o.endTime}`, lines: [fmtMinutes(o.minutes), o.reason], note: o.decisionNote };
    }
    case "expenses": {
      const e = r as Expense;
      return {
        title: `${e.category} · ${peso(e.amount)}`,
        lines: [fmtDay(e.date), e.description, ...(e.receiptId ? ["Receipt attached"] : []), ...(e.reimbursedIn ? [`Reimbursed in ${e.reimbursedIn.name}`] : [])],
        note: e.decisionNote,
      };
    }
    case "coe": {
      const c = r as Coe;
      return { title: "Certificate of employment", lines: [c.purpose, ...(c.includeCompensation ? ["With compensation"] : [])], note: c.note };
    }
    case "loans": {
      const l = r as Loan;
      return {
        title: `${LOAN_TYPE_LABELS[l.type as keyof typeof LOAN_TYPE_LABELS] ?? l.type} · ${peso(l.principal)}`,
        lines: [`${peso(l.amortization)} per payroll from ${fmtDay(l.startDate)}`, ...(l.status === "ACTIVE" ? [`Balance ${peso(l.balance)}`] : []), ...(l.reason ? [l.reason] : [])],
        note: null,
      };
    }
  }
}
