import type { Metadata } from "next";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { orgChartPeople } from "@/server/services/org-chart";
import { PageHeader } from "@/components/ui/card";
import { OrgTree } from "./org-tree";

export const metadata: Metadata = { title: "Org chart" };

export default async function OrgChartPage() {
  const user = await requireSession();
  const people = await orgChartPeople();
  const departments = [...new Map(people.filter((p) => p.deptId).map((p) => [p.deptId!, { id: p.deptId!, name: p.dept! }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader title="Org chart" description={`${people.length} people · who reports to whom`} />
      <OrgTree people={people} departments={departments} linkable={isStaff(user)} />
    </>
  );
}
