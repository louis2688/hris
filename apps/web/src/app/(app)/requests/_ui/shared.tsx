import Link from "next/link";
import { Banknote, Clock, FileBadge, Receipt, type LucideIcon } from "lucide-react";
import { LOAN_STATUS_LABELS, REQUEST_STATUS_LABELS, type RequestKind } from "@hris/shared";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { cn, fullName } from "@/lib/utils";
import { CancelRequestButton, DecisionForm } from "./forms";

type Status = keyof typeof REQUEST_STATUS_LABELS | keyof typeof LOAN_STATUS_LABELS;
const TONE = { PENDING: "amber", APPROVED: "green", ACTIVE: "blue", PAID: "green", REJECTED: "red", CANCELLED: "slate" } as const;

/** One badge for RequestStatus and LoanStatus. */
export function RequestStatusBadge({ status }: { status: Status }) {
  return <Badge tone={TONE[status]}>{(LOAN_STATUS_LABELS as Record<string, string>)[status] ?? REQUEST_STATUS_LABELS[status as keyof typeof REQUEST_STATUS_LABELS]}</Badge>;
}

const pesoFmt = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export const peso = (n: { toString(): string } | number | null | undefined) => (n == null ? "-" : pesoFmt.format(Number(n.toString())));
export const hours = (min: number) => [min >= 60 ? `${Math.floor(min / 60)}h` : "", min % 60 ? `${min % 60}m` : ""].filter(Boolean).join(" ");
export const shortRef = (id: string) => id.slice(-8).toUpperCase();

export const KINDS: { kind: RequestKind; label: string; short: string; icon: LucideIcon; blurb: string }[] = [
  { kind: "overtime", label: "Overtime", short: "Overtime", icon: Clock, blurb: "Hours worked beyond your shift" },
  { kind: "coe", label: "Certificates", short: "Certificate", icon: FileBadge, blurb: "Certificate of employment" },
  { kind: "expenses", label: "Expenses", short: "Expense", icon: Receipt, blurb: "Reimbursement with receipt" },
  { kind: "loans", label: "Loans", short: "Loan", icon: Banknote, blurb: "Cash advance or salary loan" },
];
export const kindMeta = (k: RequestKind) => KINDS.find((x) => x.kind === k)!;

/** Page title + section nav shared by the hub and each list page. */
export function RequestsHeader({ active, description, actions }: { active: RequestKind | "all"; description: string; actions?: React.ReactNode }) {
  const items = [{ href: "/requests", label: "All", key: "all" }, ...KINDS.map((k) => ({ href: `/requests/${k.kind}`, label: k.label, key: k.kind }))];
  return (
    <>
      <PageHeader title="Requests" description={description} actions={actions} />
      <nav className="-mx-4 mb-5 overflow-x-auto border-b border-hairline px-4 scrollbar-thin lg:mx-0 lg:px-0" aria-label="Request types">
        <ul className="flex gap-5">
          {items.map((i) => (
            <li key={i.key}>
              <Link
                href={i.href}
                aria-current={active === i.key ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block whitespace-nowrap border-b-2 py-2.5 text-sm font-medium transition-colors",
                  active === i.key ? "border-ink text-ink" : "border-transparent text-slate-500 hover:text-ink",
                )}
              >
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

type Person = { firstName: string; lastName: string; preferredName: string | null; avatarUrl: string | null };
export type RowItem = { id: string; href: string; kind: RequestKind; title: string; meta: string; status: Status; amount?: string; employee?: Person };

export function RequestList({ rows, title, action, empty = "Nothing here yet." }: { rows: RowItem[]; title?: string; action?: React.ReactNode; empty?: string }) {
  return (
    <Card>
      {title ? <CardHeader title={title} action={action} /> : null}
      {rows.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => {
            const Icon = kindMeta(r.kind).icon;
            return (
              <li key={r.id}>
                <Link href={r.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas sm:px-5">
                  {r.employee ? (
                    <Avatar first={r.employee.firstName} last={r.employee.lastName} src={r.employee.avatarUrl} />
                  ) : (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bone text-ink" aria-hidden>
                      <Icon className="size-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {r.employee ? fullName(r.employee) : r.title}
                      {r.employee ? <span className="ml-2 font-normal text-slate-500">{r.title}</span> : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">{r.meta}</p>
                  </div>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <RequestStatusBadge status={r.status} />
                    {r.amount ? <span className="text-xs font-medium tabular-nums text-slate-700">{r.amount}</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Breadcrumb + title for detail pages. */
export function DetailHeader({ kind, title, description, status }: { kind: RequestKind; title: string; description: string; status: Status }) {
  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/requests" className="text-slate-500 hover:text-brand-700">
          Requests
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <Link href={`/requests/${kind}`} className="text-slate-500 hover:text-brand-700">
          {kindMeta(kind).label}
        </Link>
      </p>
      <PageHeader title={title} description={description} actions={<RequestStatusBadge status={status} />} />
    </>
  );
}

export function EmployeeStrip({ e }: { e: Person & { id: string; employeeCode: string; department: { name: string } | null } }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
      <Avatar first={e.firstName} last={e.lastName} src={e.avatarUrl} size="lg" />
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{fullName(e)}</p>
        <p className="truncate text-sm text-slate-500">
          {e.employeeCode}
          {e.department ? ` · ${e.department.name}` : ""}
        </p>
      </div>
    </div>
  );
}

/** Decision + cancel cards for a detail page's side column. */
export function ActionsAside({ kind, id, decide, cancel, decideHint, children }: { kind: RequestKind; id: string; decide: boolean; cancel: boolean; decideHint?: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-6">
      {decide ? (
        <Card>
          <CardHeader title="Decision" description={decideHint} />
          <div className="px-5 py-4">
            <DecisionForm kind={kind} id={id} />
          </div>
        </Card>
      ) : null}
      {children}
      {cancel ? (
        <Card>
          <CardHeader title="Changed your mind?" description="Pending requests can be withdrawn." />
          <div className="px-5 py-4">
            <CancelRequestButton kind={kind} id={id} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
