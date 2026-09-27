import { SEPARATION_STATUS_LABELS } from "@hris/shared";
import { Badge } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils";

export function SeparationBadges({ status, deadline, overdue }: { status: keyof typeof SEPARATION_STATUS_LABELS; deadline: string; overdue: boolean }) {
  const tone = { CLEARANCE: "amber", FINAL_PAY: "blue", COMPLETED: "green", CANCELLED: "slate" } as const;
  return (
    <>
      <Badge tone={tone[status]}>{SEPARATION_STATUS_LABELS[status]}</Badge>
      {status === "CANCELLED" || status === "COMPLETED" ? null : overdue ? <Badge tone="red">Final pay overdue since {fmtDate(deadline)}</Badge> : <Badge tone="slate">Final pay due {fmtDate(deadline)}</Badge>}
    </>
  );
}
