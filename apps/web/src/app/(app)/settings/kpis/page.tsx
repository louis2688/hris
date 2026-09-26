import type { Metadata } from "next";
import { listJobTitles } from "@/server/services/org";
import { listKpis } from "@/server/services/performance";
import { deleteKpiAction, saveKpiAction } from "@/server/actions/performance";
import { EntityManager } from "@/components/entity-manager";
import { Badge } from "@/components/ui/card";

export const metadata: Metadata = { title: "KPIs" };

export default async function KpisPage() {
  const [kpis, titles] = await Promise.all([listKpis(), listJobTitles()]);
  return (
    <EntityManager
      title="KPIs"
      description="Snapshotted into each review when a cycle is activated. Edits only affect future cycles."
      singular="KPI"
      columns={["Name", "Applies to", "Scale", "Status"]}
      rows={kpis.map((k) => ({
        id: k.id,
        cells: [
          <span key="n">
            {k.name}
            {k.description ? <span className="block text-xs font-normal text-slate-500">{k.description}</span> : null}
          </span>,
          k.jobTitle?.name ?? "Everyone",
          `${k.minRating} - ${k.maxRating}`,
          <Badge key="s" tone={k.isActive ? "green" : "slate"}>{k.isActive ? "Active" : "Inactive"}</Badge>,
        ],
        values: k,
      }))}
      fields={[
        { name: "name", label: "Name", required: true, span: 2 },
        { name: "description", label: "Description", type: "textarea", span: 2 },
        { name: "jobTitleId", label: "Job title", type: "select", options: titles.map((t) => ({ id: t.id, name: t.name })), placeholder: "Everyone", span: 2 },
        { name: "minRating", label: "Lowest rating", type: "number", min: 0, placeholder: "1" },
        { name: "maxRating", label: "Highest rating", type: "number", min: 1, placeholder: "5" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
      saveAction={saveKpiAction}
      deleteAction={deleteKpiAction}
      deleteConfirm="Delete this KPI? Past reviews keep their copy. Deactivate instead to hide it from new cycles."
    />
  );
}
