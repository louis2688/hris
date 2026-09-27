import type { Metadata } from "next";
import { gate } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { EmployeeForm } from "../employee-form";
import { loadFormOptions } from "../options";
import { listFieldDefs } from "@/server/services/custom-fields";

export const metadata: Metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  await gate("ADMIN", "HR");
  const [options, defs] = await Promise.all([loadFormOptions(), listFieldDefs(true)]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Add employee" description="Personal, job and contact details. A login account is optional." />
      <EmployeeForm mode="create" options={options} customFields={{ defs, values: {} }} />
    </div>
  );
}
