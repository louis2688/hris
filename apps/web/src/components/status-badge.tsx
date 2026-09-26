import { EMPLOYMENT_STATUS_LABELS, LEAVE_STATUS_LABELS, type EmploymentStatus, type LeaveStatus } from "@hris/shared";
import { Badge } from "@/components/ui/card";

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const tone = { PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "slate" } as const;
  return <Badge tone={tone[status]}>{LEAVE_STATUS_LABELS[status]}</Badge>;
}

export function EmploymentStatusBadge({ status }: { status: EmploymentStatus }) {
  const tone = { ACTIVE: "green", PROBATION: "blue", ON_LEAVE: "amber", SUSPENDED: "red", RESIGNED: "slate", TERMINATED: "slate" } as const;
  return <Badge tone={tone[status]}>{EMPLOYMENT_STATUS_LABELS[status]}</Badge>;
}

export function LeaveTypeDot({ color, name }: { color: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {name}
    </span>
  );
}
