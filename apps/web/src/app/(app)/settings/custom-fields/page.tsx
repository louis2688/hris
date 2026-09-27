import type { Metadata } from "next";
import { CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABELS } from "@hris/shared";
import { listFieldDefs } from "@/server/services/custom-fields";
import { deactivateCustomFieldAction, saveCustomFieldAction } from "@/server/actions/lifecycle";
import { EntityManager } from "@/components/entity-manager";
import { Badge } from "@/components/ui/card";

export const metadata: Metadata = { title: "Custom fields" };

export default async function CustomFieldsPage() {
  const defs = await listFieldDefs();
  return (
    <EntityManager
      title="Custom fields"
      description="Extra employee details shown on the profile, the employee form and the report builder"
      singular="field"
      columns={["Label", "Key", "Type", "Required", "Status"]}
      rows={defs.map((d) => ({
        id: d.id,
        cells: [
          d.label,
          <span key="k" className="font-mono text-xs">{d.key}</span>,
          d.type === "SELECT" ? `${CUSTOM_FIELD_TYPE_LABELS[d.type]} (${d.options.length})` : CUSTOM_FIELD_TYPE_LABELS[d.type],
          d.required ? "Yes" : "No",
          d.isActive ? <Badge key="s" tone="green">Active</Badge> : <Badge key="s">Inactive</Badge>,
        ],
        values: { label: d.label, type: d.type, options: d.options.join("\n"), required: d.required ? "true" : "", isActive: d.isActive, sortOrder: d.sortOrder },
        deletable: d.isActive,
      }))}
      fields={[
        { name: "label", label: "Label", required: true, span: 2, hint: "The key is generated from the label on create and never changes" },
        { name: "type", label: "Type", type: "select", required: true, placeholder: "Pick a type", options: CUSTOM_FIELD_TYPES.map((t) => ({ id: t, name: CUSTOM_FIELD_TYPE_LABELS[t] })) },
        // ponytail: a select, not a checkbox, because EntityManager ticks new checkboxes by default.
        { name: "required", label: "Required", type: "select", placeholder: "Optional", options: [{ id: "true", name: "Required" }] },
        { name: "options", label: "Options (dropdown only)", type: "textarea", span: 2, hint: "One option per line" },
        { name: "sortOrder", label: "Sort order", type: "number", min: 0 },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
      saveAction={saveCustomFieldAction}
      deleteAction={deactivateCustomFieldAction}
      deleteConfirm="Deactivate this field? It disappears from forms, but values already saved on employees are kept."
    />
  );
}
