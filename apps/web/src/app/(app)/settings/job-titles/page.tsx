import type { Metadata } from "next";
import { listJobTitles } from "@/server/services/org";
import { deleteJobTitleAction, saveJobTitleAction } from "@/server/actions/org";
import { EntityManager } from "@/components/entity-manager";

export const metadata: Metadata = { title: "Job titles" };

export default async function JobTitlesPage() {
  const titles = await listJobTitles();
  return (
    <EntityManager
      title="Job titles"
      singular="job title"
      columns={["Name", "Description", "People"]}
      rows={titles.map((t) => ({ id: t.id, cells: [t.name, t.description ?? "-", t._count.employees], values: { name: t.name, description: t.description } }))}
      fields={[
        { name: "name", label: "Name", required: true, span: 2 },
        { name: "description", label: "Description", type: "textarea", span: 2 },
      ]}
      saveAction={saveJobTitleAction}
      deleteAction={deleteJobTitleAction}
    />
  );
}
