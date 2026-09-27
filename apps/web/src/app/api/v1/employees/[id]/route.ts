import { apiError, handler, json } from "@/server/api";
import { canAccessEmployee } from "@/server/authz";
import { employeeForViewer, getEmployee } from "@/server/services/employees";

/** GET /api/v1/employees/:id */
export const GET = handler<{ id: string }>(async ({ params, user }) => {
  if (!(await canAccessEmployee(user, params.id))) return apiError(404, "NOT_FOUND", "Employee not found");
  return json({ employee: employeeForViewer(user, await getEmployee(params.id)) });
});
