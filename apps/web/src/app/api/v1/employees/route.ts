import { employeeListQuerySchema } from "@hris/shared";
import { handler, json, query } from "@/server/api";
import { visibleEmployeeIds } from "@/server/authz";
import { listEmployees } from "@/server/services/employees";

/** GET /api/v1/employees -> directory scoped to what the caller may see. */
export const GET = handler(async ({ req, user }) => {
  const q = query(req, employeeListQuerySchema);
  return json(await listEmployees(q, await visibleEmployeeIds(user)));
});
