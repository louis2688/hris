"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { EXPENSE_CATEGORIES, LOAN_TYPE_LABELS, LOAN_TYPES, otMinutes, type RequestKind } from "@hris/shared";
import { cancelRequestAction, createCoeAction, createExpenseAction, createLoanAction, createOvertimeAction, decideRequestAction } from "@/server/actions/requests";
import { ActionForm, ConfirmButton, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";

type EmployeeOpt = { id: string; name: string };
const localToday = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the browser's zone
const TITLES: Record<RequestKind, [string, string]> = {
  overtime: ["File overtime", "Your manager approves it before it reaches payroll."],
  coe: ["Request a certificate", "HR reviews it, then you can print the certificate."],
  expenses: ["Claim an expense", "Approved claims are reimbursed in the next payroll run."],
  loans: ["Apply for a loan", "HR approves it; amortization is deducted every payroll run."],
};

/** "New" button + dialog for one request kind. Opens itself on ?new=<kind>. */
export function NewRequestButton({ kind, label, employees, variant = "default" }: { kind: RequestKind; label: string; employees?: EmployeeOpt[]; variant?: "default" | "brand" | "secondary" }) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = React.useState(params.get("new") === kind);
  const close = () => {
    setOpen(false);
    if (params.get("new")) router.replace(window.location.pathname);
  };
  const done = (d: { id: string }) => {
    setOpen(false);
    router.push(`/requests/${kind}/${d.id}`);
  };
  const [title, description] = TITLES[kind];
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent title={employees && kind === "loans" ? "New loan" : title} description={employees && kind === "loans" ? "Apply for yourself, or book an active loan for an employee (e.g. SSS salary loan)." : description}>
          {kind === "overtime" ? <OvertimeForm onDone={done} /> : kind === "coe" ? <CoeForm onDone={done} /> : kind === "expenses" ? <ExpenseForm onDone={done} /> : <LoanForm onDone={done} employees={employees} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

type Done = { onDone: (d: { id: string }) => void };
type Changeable = React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

/** React resets uncontrolled fields after every action (even a failed one); controlled fields keep what was typed. */
function useFields<T extends Record<string, string>>(init: T) {
  const [v, set] = React.useState(init);
  const bind = (k: keyof T & string) => ({ id: k, name: k, value: v[k], onChange: (e: Changeable) => set((o) => ({ ...o, [k]: e.target.value })) });
  return [bind, v] as const;
}

const dur = (min: number) => [min >= 60 ? `${Math.floor(min / 60)}h` : "", min % 60 ? `${min % 60}m` : ""].filter(Boolean).join(" ");

function OvertimeForm({ onDone }: Done) {
  const [f, v] = useFields({ date: localToday(), startTime: "18:00", endTime: "20:00", reason: "" });
  const valid = /^\d\d:\d\d$/.test(v.startTime) && /^\d\d:\d\d$/.test(v.endTime) && v.startTime !== v.endTime;
  return (
    <ActionForm action={createOvertimeAction} submitLabel="Submit overtime" onSuccess={onDone}>
      <FormField label="Date" name="date" required>
        <Input type="date" {...f("date")} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Start" name="startTime" required>
          <Input type="time" {...f("startTime")} />
        </FormField>
        <FormField label="End" name="endTime" required>
          <Input type="time" {...f("endTime")} />
        </FormField>
      </div>
      <p className="rounded-xl bg-bone px-3.5 py-2.5 text-sm text-slate-700" aria-live="polite">
        {valid ? (
          <>
            Duration <span className="font-semibold tabular-nums text-ink">{dur(otMinutes(v.startTime, v.endTime))}</span>
            {v.endTime <= v.startTime ? " · ends the next day" : ""}
          </>
        ) : (
          "Pick a start and end time"
        )}
      </p>
      <FormField label="Reason" name="reason" required>
        <Textarea rows={3} placeholder="e.g. Production release, month-end closing" {...f("reason")} />
      </FormField>
    </ActionForm>
  );
}

const PURPOSES = ["Bank loan", "Visa application", "Housing loan", "Credit card application", "Employment verification", "Scholarship application"];

function CoeForm({ onDone }: Done) {
  const [f] = useFields({ purpose: "" });
  return (
    <ActionForm action={createCoeAction} submitLabel="Send to HR" onSuccess={onDone}>
      <FormField label="Purpose" name="purpose" required hint="Printed on the certificate">
        <Input list="coe-purposes" placeholder="e.g. Visa application" autoComplete="off" {...f("purpose")} />
        <datalist id="coe-purposes">
          {PURPOSES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </FormField>
      <Checkbox name="includeCompensation" label="Include my monthly compensation" />
    </ActionForm>
  );
}

function ExpenseForm({ onDone }: Done) {
  const [f] = useFields({ date: localToday(), category: "", amount: "", description: "" });
  return (
    <ActionForm action={createExpenseAction} submitLabel="Submit claim" onSuccess={onDone}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Date" name="date" required>
          <Input type="date" max={localToday()} {...f("date")} />
        </FormField>
        <FormField label="Category" name="category" required>
          <Select {...f("category")}>
            <option value="" disabled>
              Choose
            </option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Amount (PHP)" name="amount" required>
        <Input inputMode="decimal" placeholder="0.00" autoComplete="off" {...f("amount")} />
      </FormField>
      <FormField label="Description" name="description" required>
        <Textarea rows={2} placeholder="e.g. Grab to client site in Makati" {...f("description")} />
      </FormField>
      <FormField label="Receipt" name="receipt" hint="PDF, JPG, PNG or WEBP up to 5 MB">
        <Input id="receipt" name="receipt" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="h-auto py-2 file:mr-3 file:rounded-full file:border-0 file:bg-bone file:px-3 file:py-1 file:text-sm file:font-medium" />
      </FormField>
    </ActionForm>
  );
}

function LoanForm({ onDone, employees }: Done & { employees?: EmployeeOpt[] }) {
  const [f, v] = useFields({ employeeId: "", type: "CASH_ADVANCE", principal: "", amortization: "", startDate: localToday(), reason: "" });
  const p = Number(v.principal.replace(/,/g, ""));
  const a = Number(v.amortization.replace(/,/g, ""));
  const runs = p > 0 && a > 0 && a <= p ? Math.ceil(p / a) : 0;
  return (
    <ActionForm action={createLoanAction} submitLabel={v.employeeId ? "Add active loan" : "Submit application"} onSuccess={onDone}>
      {employees ? (
        <FormField label="Employee" name="employeeId" hint={v.employeeId ? "Booked as active right away; no approval step." : "Leave as yourself to apply normally."}>
          <Select {...f("employeeId")}>
            <option value="">Myself (apply)</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}
      <FormField label="Type" name="type" required>
        <Select {...f("type")}>
          {LOAN_TYPES.map((t) => (
            <option key={t} value={t}>
              {LOAN_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Principal (PHP)" name="principal" required>
          <Input inputMode="decimal" placeholder="0.00" autoComplete="off" {...f("principal")} />
        </FormField>
        <FormField label="Per payroll (PHP)" name="amortization" required>
          <Input inputMode="decimal" placeholder="0.00" autoComplete="off" {...f("amortization")} />
        </FormField>
      </div>
      {runs ? (
        <p className="rounded-xl bg-bone px-3.5 py-2.5 text-sm text-slate-700">
          Paid off in about <span className="font-semibold text-ink">{runs}</span> payroll run{runs === 1 ? "" : "s"}.
        </p>
      ) : null}
      <FormField label="First deduction on or after" name="startDate" required>
        <Input type="date" {...f("startDate")} />
      </FormField>
      <FormField label="Reason" name="reason">
        <Textarea rows={2} placeholder="Optional" {...f("reason")} />
      </FormField>
    </ActionForm>
  );
}

export function DecisionForm({ kind, id }: { kind: RequestKind; id: string }) {
  const [state, action, pending] = React.useActionState(decideRequestAction.bind(null, kind, id), undefined);
  React.useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message ?? "Done");
    else toast.error(state.error);
  }, [state]);
  return (
    <form action={action} className="space-y-3">
      <Textarea name="note" aria-label="Note" placeholder="Optional note for the employee" rows={3} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" name="decision" value="REJECTED" variant="secondary" loading={pending}>
          Reject
        </Button>
        <Button type="submit" name="decision" value="APPROVED" variant="success" loading={pending}>
          Approve
        </Button>
      </div>
    </form>
  );
}

export function CancelRequestButton({ kind, id }: { kind: RequestKind; id: string }) {
  return (
    <ConfirmButton action={cancelRequestAction.bind(null, kind, id)} confirm="Cancel this request?" variant="secondary" className="w-full">
      Cancel request
    </ConfirmButton>
  );
}
