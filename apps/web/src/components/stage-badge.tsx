import { CANDIDATE_STAGE_LABELS, type CandidateStage } from "@hris/shared";
import { Badge } from "@/components/ui/card";

const TONE: Record<CandidateStage, "slate" | "blue" | "violet" | "amber" | "green" | "red"> = {
  APPLIED: "slate",
  SHORTLISTED: "blue",
  INTERVIEW: "violet",
  OFFERED: "amber",
  HIRED: "green",
  REJECTED: "red",
  WITHDRAWN: "slate",
};

export const StageBadge = ({ stage }: { stage: CandidateStage }) => <Badge tone={TONE[stage]}>{CANDIDATE_STAGE_LABELS[stage]}</Badge>;
