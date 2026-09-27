import type { Metadata } from "next";
import Link from "next/link";
import { listCycles } from "@/server/services/performance";
import { activateCycleAction, closeCycleAction, deleteCycleAction, saveCycleAction } from "@/server/actions/performance";
import { EntityManager } from "@/components/entity-manager";
import { ConfirmButton } from "@/components/action-form";
import { fmtDate } from "@/lib/utils";
import { CycleBadge } from "../../performance/review-badge";
import { gate } from "@/server/auth/session";

export const metadata: Metadata = { title: "Review cycles" };

export default async function ReviewCyclesPage() {
  await gate("ADMIN", "HR"); // layouts are skipped on client navigations, so each page guards itself
  const cycles = await listCycles();
  return (
    <EntityManager
      title="Review cycles"
      description="Activating creates a review for every current employee hired before the period ends, assigned to their manager."
      singular="review cycle"
      columns={["Name", "Period", "Due", "Progress", "Status", ""]}
      rows={cycles.map((c) => ({
        id: c.id,
        deletable: c.status === "DRAFT",
        cells: [
          <Link key="n" href={`/performance?cycle=${c.id}`} className="hover:text-brand-700">
            {c.name}
          </Link>,
          `${fmtDate(c.periodStart)} - ${fmtDate(c.periodEnd)}`,
          fmtDate(c.dueDate),
          c.total ? `${c.byStatus.COMPLETED ?? 0}/${c.total} completed` : "-",
          <CycleBadge key="s" status={c.status} />,
          c.status === "DRAFT" ? (
            <ConfirmButton key="a" action={activateCycleAction.bind(null, c.id)} confirm={`Activate "${c.name}"? Reviews will be created and employees notified.`} variant="success" size="sm">
              Activate
            </ConfirmButton>
          ) : c.status === "ACTIVE" ? (
            <ConfirmButton key="a" action={closeCycleAction.bind(null, c.id)} confirm={`Close "${c.name}"? Reviews can no longer be edited.`} variant="secondary" size="sm">
              Close
            </ConfirmButton>
          ) : null,
        ],
        values: c,
      }))}
      fields={[
        { name: "name", label: "Name", required: true, placeholder: "H1 2027", span: 2 },
        { name: "periodStart", label: "Period start", type: "date", required: true },
        { name: "periodEnd", label: "Period end", type: "date", required: true },
        { name: "dueDate", label: "Due date", type: "date", required: true },
      ]}
      saveAction={saveCycleAction}
      deleteAction={deleteCycleAction}
      deleteConfirm="Delete this draft cycle?"
    />
  );
}
