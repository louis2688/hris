import { Badge } from "@/components/ui/card";

/** OPEN splits into Scheduled / Live / Ended by its date window. */
export function SurveyStatusBadge({ s }: { s: { status: "DRAFT" | "OPEN" | "CLOSED"; live: boolean; opensAt: Date | null } }) {
  if (s.status === "DRAFT") return <Badge tone="slate">Draft</Badge>;
  if (s.status === "CLOSED") return <Badge tone="blue">Closed</Badge>;
  if (s.live) return <Badge tone="green">Live</Badge>;
  return s.opensAt && s.opensAt > new Date() ? <Badge tone="violet">Scheduled</Badge> : <Badge tone="amber">Ended</Badge>;
}
