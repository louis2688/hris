import type { Metadata } from "next";
import Link from "next/link";
import { gate } from "@/server/auth/session";
import { listLeaveTypes } from "@/server/services/leave";
import { departmentOptions } from "@/server/services/org";
import { listBlockDates } from "@/server/services/timeoff";
import { deleteBlockDateAction, saveBlockDateAction } from "@/server/actions/timeoff";
import { EntityManager } from "@/components/entity-manager";
import { Card, CardHeader } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Leave policies" };

export default async function LeavePoliciesPage() {
  await gate("HR", "ADMIN");
  const [blocks, departments, types] = await Promise.all([listBlockDates(), departmentOptions(), listLeaveTypes()]);
  const rules = [
    { label: "Accrual", on: types.filter((t) => t.accrualPerMonth != null).map((t) => `${t.name} (${Number(t.accrualPerMonth)}/mo)`) },
    { label: "Encashable", on: types.filter((t) => t.allowEncashment).map((t) => t.name) },
    { label: "Compensatory", on: types.filter((t) => t.isCompensatory).map((t) => t.name) },
  ];
  return (
    <div className="space-y-6">
      <EntityManager
        title="Block dates"
        description="Employees can't file leave on these dates. HR and Admin can still file on their behalf."
        singular="block date"
        columns={["Name", "Dates", "Applies to"]}
        rows={blocks.map((b) => ({
          id: b.id,
          cells: [b.name, b.from.getTime() === b.to.getTime() ? fmtDate(b.from) : `${fmtDate(b.from)} - ${fmtDate(b.to)}`, b.department?.name ?? "Everyone"],
          values: { name: b.name, from: b.from, to: b.to, departmentId: b.departmentId ?? "" },
        }))}
        fields={[
          { name: "name", label: "Name", required: true, placeholder: "Year-end inventory", span: 2 },
          { name: "from", label: "From", type: "date", required: true },
          { name: "to", label: "To", type: "date", required: true },
          { name: "departmentId", label: "Department", type: "select", options: departments, placeholder: "Everyone", span: 2 },
        ]}
        saveAction={saveBlockDateAction}
        deleteAction={deleteBlockDateAction}
        deleteConfirm="Delete this block date?"
      />
      <Card>
        <CardHeader title="Leave type rules" description={<>Set per type in <Link href="/settings/leave-types" className="font-medium text-ink underline underline-offset-2">Leave types</Link>.</>} />
        <dl className="divide-y divide-slate-100 text-sm">
          {rules.map((r) => (
            <div key={r.label} className="grid gap-1 px-5 py-3 sm:grid-cols-[160px_1fr]">
              <dt className="font-medium text-ink">{r.label}</dt>
              <dd className="text-slate-600">{r.on.length ? r.on.join(", ") : "None"}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Accruing types earn their monthly rate for each completed month of the year (from the hire date for new hires), capped at the entitlement. Encashed vacation leave is tax-exempt up to 10 days a year (de minimis); the rest is taxable.
        </p>
      </Card>
    </div>
  );
}
