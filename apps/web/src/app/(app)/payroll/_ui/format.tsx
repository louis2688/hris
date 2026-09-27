import { PAYROLL_KIND_LABELS, PAYROLL_STATUS_LABELS } from "@hris/shared";
import { Badge } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils";

const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export const peso = (n: number | { toString(): string } | null | undefined) => php.format(Number(n ?? 0));

export const periodLabel = (start: Date, end: Date) =>
  start.getUTCFullYear() === end.getUTCFullYear() ? `${fmtDate(start, "d MMM")} - ${fmtDate(end, "d MMM yyyy")}` : `${fmtDate(start)} - ${fmtDate(end)}`;

export function RunStatusBadge({ status }: { status: keyof typeof PAYROLL_STATUS_LABELS }) {
  const tone = { DRAFT: "amber", FINALIZED: "blue", PAID: "green" } as const;
  return <Badge tone={tone[status]}>{PAYROLL_STATUS_LABELS[status]}</Badge>;
}

export const kindLabel = (k: keyof typeof PAYROLL_KIND_LABELS) => PAYROLL_KIND_LABELS[k];
