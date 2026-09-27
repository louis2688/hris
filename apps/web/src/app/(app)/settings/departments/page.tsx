import type { Metadata } from "next";
import { employeeOptions } from "@/server/services/employees";
import { listDepartments } from "@/server/services/org";
import { deleteDepartmentAction, saveDepartmentAction } from "@/server/actions/org";
import { EntityManager } from "@/components/entity-manager";
import { fullName } from "@/lib/utils";
import { gate } from "@/server/auth/session";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  await gate("ADMIN", "HR"); // layouts are skipped on client navigations, so each page guards itself
  const [departments, employees] = await Promise.all([listDepartments(), employeeOptions()]);
  const people = employees.map((e) => ({ id: e.id, name: `${fullName(e)} (${e.employeeCode})` }));
  return (
    <EntityManager
      title="Departments"
      singular="department"
      columns={["Name", "Code", "Head", "Parent", "People"]}
      rows={departments.map((d) => ({
        id: d.id,
        cells: [d.name, d.code ?? "-", d.head ? fullName(d.head) : "-", d.parent?.name ?? "-", d._count.employees],
        values: { name: d.name, code: d.code, headId: d.headId, parentId: d.parentId },
      }))}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "code", label: "Code", placeholder: "ENG" },
        { name: "headId", label: "Department head", type: "select", options: people, placeholder: "Nobody yet" },
        { name: "parentId", label: "Parent department", type: "select", options: departments.map((d) => ({ id: d.id, name: d.name })), placeholder: "Top level" },
      ]}
      saveAction={saveDepartmentAction}
      deleteAction={deleteDepartmentAction}
    />
  );
}
