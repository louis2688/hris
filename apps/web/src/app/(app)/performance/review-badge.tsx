import { REVIEW_STATUS_LABELS, type ReviewCycleStatus, type ReviewStatus } from "@hris/shared";
import { Badge } from "@/components/ui/card";

const TONE = { SELF_REVIEW: "amber", MANAGER_REVIEW: "violet", COMPLETED: "green" } as const;
const CYCLE_TONE = { DRAFT: "slate", ACTIVE: "green", CLOSED: "blue" } as const;

export const ReviewBadge = ({ status }: { status: ReviewStatus }) => <Badge tone={TONE[status]}>{REVIEW_STATUS_LABELS[status]}</Badge>;
export const CycleBadge = ({ status }: { status: ReviewCycleStatus }) => <Badge tone={CYCLE_TONE[status]}>{status.toLowerCase()}</Badge>;
