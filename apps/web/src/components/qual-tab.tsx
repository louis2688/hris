import "server-only";
import { EmployeeQualifications } from "@/components/employee-qualifications";
import { employeeQualifications, listQualifications } from "@/server/services/qualifications";

export async function QualTab({ employeeId }: { employeeId: string }) {
  const [rows, options] = await Promise.all([employeeQualifications(employeeId), listQualifications()]);
  return (
    <EmployeeQualifications
      employeeId={employeeId}
      rows={rows.map((r) => ({ ...r, amount: r.amount?.toString() ?? null }))}
      options={options.map((o) => ({ id: o.id, name: o.name, kind: o.kind }))}
    />
  );
}
