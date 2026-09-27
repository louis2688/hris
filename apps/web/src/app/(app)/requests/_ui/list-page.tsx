import { LOAN_TYPE_LABELS, type RequestKind, type SessionUser } from "@hris/shared";
import { isStaff } from "@/server/authz";
import { employeeOptions } from "@/server/services/employees";
import { hasTeam, listMine, listTeam } from "@/server/services/requests";
import { Card, EmptyState } from "@/components/ui/card";
import { TabNav } from "@/components/profile";
import { fmtDate, fullName } from "@/lib/utils";
import { NewRequestButton } from "./forms";
import { hours, kindMeta, peso, RequestList, RequestsHeader, type RowItem } from "./shared";

type Person = RowItem["employee"];
type Base = { id: string; status: RowItem["status"]; createdAt: Date; employee?: NonNullable<Person> };

const row = (kind: RequestKind, r: Base, withEmployee: boolean, rest: Pick<RowItem, "title" | "meta" | "amount">): RowItem & { at: number } => ({
  id: r.id,
  kind,
  href: `/requests/${kind}/${r.id}`,
  status: r.status,
  employee: withEmployee ? r.employee : undefined,
  at: r.createdAt.getTime(),
  ...rest,
});

type Lists = {
  overtime: (Base & { date: Date; startTime: string; endTime: string; minutes: number })[];
  coe: (Base & { purpose: string; includeCompensation: boolean })[];
  expenses: (Base & { date: Date; category: string; amount: { toString(): string }; description: string; reimbursedIn: { name: string } | null })[];
  loans: (Base & { type: keyof typeof LOAN_TYPE_LABELS; principal: { toString(): string }; amortization: { toString(): string }; balance: { toString(): string }; startDate: Date })[];
};

/** Map every list to rows, newest first. */
export function toRows(l: Partial<Lists>, withEmployee: boolean): RowItem[] {
  return [
    ...(l.overtime ?? []).map((r) => row("overtime", r, withEmployee, { title: "Overtime", meta: `${fmtDate(r.date, "EEE, d MMM yyyy")} · ${r.startTime} to ${r.endTime} · ${hours(r.minutes)}` })),
    ...(l.coe ?? []).map((r) => row("coe", r, withEmployee, { title: "Certificate of employment", meta: `${r.purpose}${r.includeCompensation ? " · with compensation" : ""} · ${fmtDate(r.createdAt)}` })),
    ...(l.expenses ?? []).map((r) =>
      row("expenses", r, withEmployee, { title: r.category, meta: `${fmtDate(r.date)} · ${r.reimbursedIn ? `Reimbursed in ${r.reimbursedIn.name}` : r.description}`, amount: peso(r.amount) }),
    ),
    ...(l.loans ?? []).map((r) =>
      row("loans", r, withEmployee, {
        title: LOAN_TYPE_LABELS[r.type],
        meta: `${peso(r.amortization)} per payroll · from ${fmtDate(r.startDate)}`,
        amount: r.status === "ACTIVE" ? `${peso(r.balance)} left` : peso(r.principal),
      }),
    ),
  ].sort((a, b) => b.at - a.at);
}

const tabs = (teamLabel: string) => [
  { key: "mine", label: "Mine" },
  { key: "team", label: teamLabel },
];

/** List page for one kind: header, New button, Mine/Team tabs. */
export async function KindListPage({ user, kind, tab }: { user: SessionUser; kind: RequestKind; tab?: string }) {
  const meta = kindMeta(kind);
  const team = hasTeam(user, kind) && (tab === "team" || !user.employeeId);
  const staffLoans = kind === "loans" && isStaff(user);
  const [mine, teamItems, pending, employees] = await Promise.all([
    user.employeeId && !team ? listMine(user.employeeId) : null,
    team ? listTeam(user, kind) : null,
    hasTeam(user, kind) ? listTeam(user, kind, "PENDING").then((x) => x.length) : 0,
    staffLoans ? employeeOptions() : null,
  ]);
  const base = `/requests/${kind}`;
  return (
    <>
      <RequestsHeader
        active={kind}
        description={meta.blurb}
        actions={
          user.employeeId || staffLoans ? (
            <NewRequestButton
              kind={kind}
              variant="brand"
              label={kind === "loans" && staffLoans ? "New loan" : `New ${meta.short.toLowerCase()}`}
              employees={employees?.filter((e) => e.id !== user.employeeId).map((e) => ({ id: e.id, name: `${fullName(e)} (${e.employeeCode})` }))}
            />
          ) : null
        }
      />
      {hasTeam(user, kind) && user.employeeId ? <TabNav base={base} active={team ? "team" : "mine"} tabs={tabs(pending ? `Team · ${pending} pending` : "Team")} /> : null}
      {team ? (
        <RequestList rows={toRows({ [kind]: teamItems }, true)} empty={`No ${meta.label.toLowerCase()} from your team yet.`} />
      ) : mine ? (
        <RequestList rows={toRows({ [kind]: mine[kind] }, false)} empty={`You have no ${meta.label.toLowerCase()} yet.`} />
      ) : (
        <Card>
          <EmptyState title="No employee profile linked" description="Ask HR to link your login to an employee record." />
        </Card>
      )}
    </>
  );
}
