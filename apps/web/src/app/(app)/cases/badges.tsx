import { CASE_STATUS_LABELS, type CaseStatus } from "@hris/shared";
import { Badge } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils";

const TONE = { OPEN: "blue", NTE_ISSUED: "amber", EXPLANATION_RECEIVED: "violet", HEARING: "violet", DECISION: "green", CLOSED: "slate" } as const;

export function CaseBadges({ status, nteDueAt }: { status: CaseStatus; nteDueAt: Date | null }) {
  const overdue = status === "NTE_ISSUED" && !!nteDueAt && nteDueAt < new Date();
  return (
    <>
      <Badge tone={TONE[status]}>{CASE_STATUS_LABELS[status]}</Badge>
      {status === "NTE_ISSUED" && nteDueAt ? overdue ? <Badge tone="red">Explanation overdue</Badge> : <Badge tone="slate">Explanation due {fmtDate(nteDueAt)}</Badge> : null}
    </>
  );
}
