import type { Metadata } from "next";
import { listLeaveTypes } from "@/server/services/leave";
import { saveLeaveTypeAction } from "@/server/actions/leave";
import { EntityManager } from "@/components/entity-manager";
import { Badge } from "@/components/ui/card";
import { LeaveTypeDot } from "@/components/status-badge";

export const metadata: Metadata = { title: "Leave types" };

export default async function LeaveTypesPage() {
  const types = await listLeaveTypes();
  return (
    <EntityManager
      title="Leave types"
      description="Deactivate instead of deleting so history stays intact."
      singular="leave type"
      columns={["Name", "Code", "Default days", "Rules", "Status"]}
      rows={types.map((t) => ({
        id: t.id,
        cells: [
          <LeaveTypeDot key="n" color={t.color} name={t.name} />,
          <span key="c" className="font-mono text-xs">{t.code}</span>,
          Number(t.defaultDays),
          [t.isPaid ? "Paid" : "Unpaid", t.requiresApproval ? "Approval" : "Auto-approve", t.allowHalfDay ? "Half days" : null, t.maxConsecutiveDays ? `Max ${t.maxConsecutiveDays}` : null].filter(Boolean).join(" · "),
          <Badge key="s" tone={t.isActive ? "green" : "slate"}>{t.isActive ? "Active" : "Inactive"}</Badge>,
        ],
        values: { ...t, defaultDays: Number(t.defaultDays) },
      }))}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "code", label: "Code", required: true, placeholder: "VL", hint: "Uppercase, short" },
        { name: "defaultDays", label: "Default days per year", type: "number", step: "0.5", min: 0, hint: "Granted to new hires automatically" },
        { name: "maxConsecutiveDays", label: "Max consecutive days", type: "number", min: 0, hint: "Blank for no limit" },
        { name: "color", label: "Colour", type: "color" },
        { name: "isPaid", label: "Paid leave (deducts from balance)", type: "checkbox" },
        { name: "requiresApproval", label: "Requires manager approval", type: "checkbox" },
        { name: "allowHalfDay", label: "Allow half days", type: "checkbox" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
      saveAction={saveLeaveTypeAction}
    />
  );
}
