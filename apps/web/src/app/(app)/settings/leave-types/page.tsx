import type { Metadata } from "next";
import { APPROVER_KINDS, APPROVER_LABELS } from "@hris/shared";
import { listLeaveTypes } from "@/server/services/leave";
import { saveLeaveTypeAction } from "@/server/actions/leave";
import { EntityManager } from "@/components/entity-manager";
import { Badge } from "@/components/ui/card";
import { LeaveTypeDot } from "@/components/status-badge";
import { gate } from "@/server/auth/session";

export const metadata: Metadata = { title: "Leave types" };

export default async function LeaveTypesPage() {
  await gate("ADMIN", "HR"); // layouts are skipped on client navigations, so each page guards itself
  const types = await listLeaveTypes();
  return (
    <EntityManager
      title="Leave types"
      description="Deactivate instead of deleting so history stays intact."
      singular="leave type"
      columns={["Name", "Code", "Default days", "Rules", "Approval", "Status"]}
      rows={types.map((t) => ({
        id: t.id,
        cells: [
          <LeaveTypeDot key="n" color={t.color} name={t.name} />,
          <span key="c" className="font-mono text-xs">{t.code}</span>,
          Number(t.defaultDays),
          [
            t.isPaid ? "Paid" : "Unpaid",
            t.allowHalfDay ? "Half days" : null,
            t.maxConsecutiveDays ? `Max ${t.maxConsecutiveDays}` : null,
            t.accrualPerMonth != null ? `Accrues ${Number(t.accrualPerMonth)}/mo` : null,
            t.allowEncashment ? "Encashable" : null,
            t.isCompensatory ? "Comp-off" : null,
          ].filter(Boolean).join(" · "),
          t.requiresApproval ? (t.approvalChain.length ? t.approvalChain : (["MANAGER"] as const)).map((k) => APPROVER_LABELS[k]).join(" → ") : "Auto-approve",
          <Badge key="s" tone={t.isActive ? "green" : "slate"}>{t.isActive ? "Active" : "Inactive"}</Badge>,
        ],
        values: { ...t, defaultDays: Number(t.defaultDays), accrualPerMonth: t.accrualPerMonth == null ? "" : Number(t.accrualPerMonth), allowEncashment: t.allowEncashment ? "true" : "", isCompensatory: t.isCompensatory ? "true" : "", level1: t.approvalChain[0] ?? "MANAGER", level2: t.approvalChain[1] ?? "", level3: t.approvalChain[2] ?? "" },
      }))}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "code", label: "Code", required: true, placeholder: "VL", hint: "Uppercase, short" },
        { name: "defaultDays", label: "Default days per year", type: "number", step: "0.5", min: 0, hint: "Granted to new hires automatically" },
        { name: "maxConsecutiveDays", label: "Max consecutive days", type: "number", min: 0, hint: "Blank for no limit" },
        { name: "accrualPerMonth", label: "Accrual per month", type: "number", step: "0.01", min: 0, hint: "Blank = full days upfront. e.g. 1.25 earns 15 a year" },
        { name: "allowEncashment", label: "Convertible to cash", type: "select", options: [{ id: "true", name: "Yes, unused days can be encashed" }], placeholder: "No" },
        { name: "isCompensatory", label: "Compensatory leave", type: "select", options: [{ id: "true", name: "Yes, credited by comp-off requests" }], placeholder: "No" },
        { name: "color", label: "Colour", type: "color" },
        { name: "isPaid", label: "Paid leave (deducts from balance)", type: "checkbox" },
        { name: "requiresApproval", label: "Requires approval", type: "checkbox" },
        { name: "level1", label: "Approver level 1", type: "select", options: APPROVER_KINDS.map((k) => ({ id: k, name: APPROVER_LABELS[k] })), placeholder: "None", hint: "Levels run in order" },
        { name: "level2", label: "Approver level 2", type: "select", options: APPROVER_KINDS.map((k) => ({ id: k, name: APPROVER_LABELS[k] })), placeholder: "None" },
        { name: "level3", label: "Approver level 3", type: "select", options: APPROVER_KINDS.map((k) => ({ id: k, name: APPROVER_LABELS[k] })), placeholder: "None" },
        { name: "allowHalfDay", label: "Allow half days", type: "checkbox" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
      saveAction={saveLeaveTypeAction}
    />
  );
}
