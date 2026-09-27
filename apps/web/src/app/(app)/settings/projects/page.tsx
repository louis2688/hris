import type { Metadata } from "next";
import { listProjects } from "@/server/services/timesheets";
import { saveProjectAction } from "@/server/actions/attendance";
import { EntityManager } from "@/components/entity-manager";
import { Badge } from "@/components/ui/card";
import { gate } from "@/server/auth/session";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await gate("ADMIN", "HR"); // layouts are skipped on client navigations, so each page guards itself
  const rows = await listProjects();
  return (
    <EntityManager
      title="Projects"
      description="Timesheet hours are logged against these. Deactivate instead of deleting."
      singular="project"
      columns={["Name", "Client", "Entries", "Status"]}
      rows={rows.map((p) => ({ id: p.id, cells: [p.name, p.client ?? "-", p._count.entries, <Badge key="s" tone={p.isActive ? "green" : "slate"}>{p.isActive ? "Active" : "Inactive"}</Badge>], values: p }))}
      fields={[
        { name: "name", label: "Name", required: true, span: 2 },
        { name: "client", label: "Client", span: 2 },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
      saveAction={saveProjectAction}
    />
  );
}
